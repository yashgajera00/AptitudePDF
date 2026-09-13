#!/usr/bin/env python3
"""
Aptitude Local Storage & PDF Backend Server
Automatically creates folders in 'uploads/<collection_name>/', saves uploaded image files directly to disk,
and serves all project assets & APIs on http://localhost:3000.
"""

import os
import sys
import json
import shutil
import mimetypes
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
UPLOADS_DIR = BASE_DIR / 'uploads'
META_FILE = UPLOADS_DIR / 'metadata.json'

# Ensure uploads directory exists
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

def load_metadata():
    if META_FILE.exists():
        try:
            with open(META_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {'collections': {}, 'images': []}
    return {'collections': {}, 'images': []}

def save_metadata(meta):
    try:
        with open(META_FILE, 'w', encoding='utf-8') as f:
            json.dump(meta, f, indent=2)
    except Exception as e:
        print(f"Error saving metadata: {e}")

def sanitize_folder_name(name):
    clean = "".join(c for c in name if c.isalnum() or c in (' ', '_', '-')).strip()
    return clean if clean else 'General Collection'

def sync_disk_state():
    """Scans uploads directory to ensure metadata is completely in sync with disk folders & files."""
    meta = load_metadata()
    collections = meta.get('collections', {})
    existing_images = {img['id']: img for img in meta.get('images', [])}
    
    # 1. Discover all folders in uploads/
    disk_folders = [d.name for d in UPLOADS_DIR.iterdir() if d.is_dir()]
    for folder in disk_folders:
        if folder not in collections:
            collections[folder] = {
                'id': 'col-' + str(abs(hash(folder))),
                'name': folder,
                'createdAt': int(os.path.getctime(UPLOADS_DIR / folder) * 1000)
            }
            
    # 2. Discover all image files inside each collection folder
    valid_exts = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg', '.jfif', '.heic', '.avif'}
    discovered_images = []
    
    for folder_name in disk_folders:
        folder_path = UPLOADS_DIR / folder_name
        files = sorted(folder_path.iterdir(), key=lambda p: os.path.getmtime(p))
        for idx, file_path in enumerate(files):
            if file_path.is_file() and file_path.suffix.lower() in valid_exts:
                rel_url = f"/uploads/{urllib.parse.quote(folder_name)}/{urllib.parse.quote(file_path.name)}"
                clean_title = file_path.stem.replace('_', ' ').replace('-', ' ').strip().title()
                img_id = f"{folder_name}-{file_path.name}"
                
                img_entry = existing_images.get(img_id, {
                    'id': img_id,
                    'title': clean_title,
                    'category': folder_name,
                    'filename': file_path.name,
                    'dataUrl': rel_url,
                    'createdAt': int(os.path.getmtime(file_path) * 1000),
                    'orderIndex': idx + 1
                })
                img_entry['dataUrl'] = rel_url
                img_entry['category'] = folder_name
                discovered_images.append(img_entry)

    # Clean removed collections
    for col_name in list(collections.keys()):
        if not (UPLOADS_DIR / col_name).exists():
            del collections[col_name]

    meta['collections'] = collections
    meta['images'] = discovered_images
    save_metadata(meta)
    return meta

class AptitudeRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, data, status=200):
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == '/api/data':
            meta = sync_disk_state()
            self.send_json({
                'success': True,
                'collections': list(meta.get('collections', {}).values()),
                'images': meta.get('images', [])
            })
            return

        if path == '/api/collections':
            meta = sync_disk_state()
            self.send_json({
                'success': True,
                'collections': list(meta.get('collections', {}).values())
            })
            return

        # Fallback to standard static file serving (HTML, JS, CSS, uploads/)
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        content_length = int(self.headers.get('Content-Length', 0))

        if path == '/api/collections':
            body_data = self.rfile.read(content_length).decode('utf-8')
            req_json = json.loads(body_data) if body_data else {}
            raw_name = req_json.get('name', '').strip()
            clean_name = sanitize_folder_name(raw_name)

            if not clean_name:
                self.send_json({'success': False, 'error': 'Invalid collection name'}, 400)
                return

            target_dir = UPLOADS_DIR / clean_name
            target_dir.mkdir(parents=True, exist_ok=True)
            meta = sync_disk_state()

            col_obj = meta['collections'].get(clean_name, {
                'id': 'col-' + str(abs(hash(clean_name))),
                'name': clean_name,
                'createdAt': int(os.path.getctime(target_dir) * 1000)
            })

            self.send_json({'success': True, 'collection': col_obj})
            return

        if path == '/api/upload':
            content_type = self.headers.get('Content-Type', '')
            
            # Handle JSON payload containing base64 images or files
            if 'application/json' in content_type:
                body_data = self.rfile.read(content_length).decode('utf-8')
                req_json = json.loads(body_data) if body_data else {}
                category = sanitize_folder_name(req_json.get('category', 'General Collection'))
                files_payload = req_json.get('files', []) # List of { filename, dataUrl }

                target_dir = UPLOADS_DIR / category
                target_dir.mkdir(parents=True, exist_ok=True)

                saved_items = []
                for item in files_payload:
                    orig_name = item.get('filename', 'photo.jpg')
                    ext = os.path.splitext(orig_name)[1] or '.jpg'
                    base_stem = os.path.splitext(orig_name)[0] or 'photo'
                    clean_filename = f"{base_stem}{ext}"
                    
                    file_path = target_dir / clean_filename
                    data_url = item.get('dataUrl', '')

                    # Decode base64
                    if ',' in data_url:
                        base64_data = data_url.split(',', 1)[1]
                    else:
                        base64_data = data_url

                    import base64
                    file_bytes = base64.b64decode(base64_data)
                    with open(file_path, 'wb') as f:
                        f.write(file_bytes)

                    rel_url = f"/uploads/{urllib.parse.quote(category)}/{urllib.parse.quote(clean_filename)}"
                    saved_items.append({
                        'id': f"{category}-{clean_filename}",
                        'title': base_stem.replace('_', ' ').replace('-', ' ').title(),
                        'category': category,
                        'filename': clean_filename,
                        'dataUrl': rel_url,
                        'createdAt': int(os.path.getmtime(file_path) * 1000)
                    })

                sync_disk_state()
                self.send_json({'success': True, 'saved': saved_items})
                return

            # Handle multipart/form-data
            if 'multipart/form-data' in content_type:
                import email
                body_bytes = self.rfile.read(content_length)
                msg = email.message_from_bytes(b'Content-Type: ' + content_type.encode() + b'\r\n\r\n' + body_bytes)
                
                category = 'General Collection'
                saved_files = []

                # Find category field first
                for part in msg.get_payload():
                    if part.get_param('name', header='content-disposition') == 'category':
                        cat_val = part.get_payload(decode=True).decode('utf-8', errors='ignore').strip()
                        if cat_val:
                            category = sanitize_folder_name(cat_val)

                target_dir = UPLOADS_DIR / category
                target_dir.mkdir(parents=True, exist_ok=True)

                # Save file parts
                for part in msg.get_payload():
                    name_param = part.get_param('name', header='content-disposition')
                    filename = part.get_filename()
                    
                    if filename and name_param in ('files', 'file', 'image'):
                        clean_fname = os.path.basename(filename)
                        dest_file = target_dir / clean_fname
                        file_data = part.get_payload(decode=True)
                        
                        with open(dest_file, 'wb') as f:
                            f.write(file_data)
                        
                        rel_url = f"/uploads/{urllib.parse.quote(category)}/{urllib.parse.quote(clean_fname)}"
                        saved_files.append({
                            'id': f"{category}-{clean_fname}",
                            'title': os.path.splitext(clean_fname)[0].replace('_', ' ').replace('-', ' ').title(),
                            'category': category,
                            'filename': clean_fname,
                            'dataUrl': rel_url
                        })

                sync_disk_state()
                self.send_json({'success': True, 'saved': saved_files})
                return

        self.send_json({'success': False, 'error': 'Endpoint not found'}, 404)

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        content_length = int(self.headers.get('Content-Length', 0))
        body_data = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
        req_json = json.loads(body_data) if body_data else {}

        if path == '/api/collections':
            cat_name = req_json.get('name', '').strip()
            if cat_name:
                target_dir = UPLOADS_DIR / cat_name
                if target_dir.exists() and target_dir.is_dir():
                    shutil.rmtree(target_dir, ignore_errors=True)
                sync_disk_state()
                self.send_json({'success': True, 'deleted': cat_name})
                return

        if path == '/api/images':
            cat_name = req_json.get('category', '').strip()
            filename = req_json.get('filename', '').strip()
            img_id = req_json.get('id', '').strip()

            deleted = False
            # 1. Delete by explicit category + filename
            if cat_name and filename:
                target_file = UPLOADS_DIR / cat_name / filename
                if target_file.exists() and target_file.is_file():
                    target_file.unlink(missing_ok=True)
                    deleted = True

            # 2. Delete by scanning uploads folder for matching filename or ID
            if not deleted:
                for folder in UPLOADS_DIR.iterdir():
                    if folder.is_dir():
                        if cat_name and folder.name.lower() != cat_name.lower():
                            continue
                        for f in folder.iterdir():
                            if f.is_file():
                                if f.name == filename or f"{folder.name}-{f.name}" == img_id or f.name == img_id:
                                    f.unlink(missing_ok=True)
                                    deleted = True
                                    break

            meta = sync_disk_state()
            # Also clean from metadata list
            meta['images'] = [img for img in meta.get('images', []) if img.get('id') != img_id and img.get('filename') != filename]
            save_metadata(meta)

            self.send_json({'success': True, 'deleted': filename or img_id})
            return

        self.send_json({'success': False, 'error': 'Invalid delete request'}, 400)

def run(port=3000):
    server_address = ('', port)
    httpd = HTTPServer(server_address, AptitudeRequestHandler)
    print(f"[OK] Aptitude Project Storage Server running at http://localhost:{port}/")
    print(f"[DIR] Local Disk Uploads Root: {UPLOADS_DIR}")
    sys.stdout.flush()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer shutting down...")
        httpd.server_close()

if __name__ == '__main__':
    port = 3000
    if len(sys.argv) > 1:
        port = int(sys.argv[1])
    run(port)
