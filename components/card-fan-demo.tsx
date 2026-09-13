import SocialCards, { CardItem } from "@/components/ui/card-fan-carousel";

const DEMO_CARDS: CardItem[] = [
  { 
    imgUrl: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&auto=format&fit=crop&q=80", 
    alt: "Mountain landscape",
    linkUrl: "#" 
  },
  { 
    imgUrl: "https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=800&auto=format&fit=crop&q=80", 
    alt: "City skyline at night",
    linkUrl: "#" 
  },
  { 
    imgUrl: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=800&auto=format&fit=crop&q=80", 
    alt: "Foggy green forest",
    linkUrl: "#" 
  },
  { 
    imgUrl: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&auto=format&fit=crop&q=80", 
    alt: "Sunlit misty valley",
    linkUrl: "#" 
  },
  { 
    imgUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80", 
    alt: "Tropical turquoise beach",
    linkUrl: "#" 
  },
  { 
    imgUrl: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&auto=format&fit=crop&q=80", 
    alt: "Starry starry mountain night",
    linkUrl: "#" 
  },
  { 
    imgUrl: "https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=800&auto=format&fit=crop&q=80", 
    alt: "Golden warm sunset",
    linkUrl: "#" 
  },
  { 
    imgUrl: "https://images.unsplash.com/photo-1439853941329-a99ce049f08c?w=800&auto=format&fit=crop&q=80", 
    alt: "Lake reflection landscape",
    linkUrl: "#" 
  },
];

export default function CardFanDemo() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 py-12">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Interactive Card Fan Carousel
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Hover over cards or use navigation arrows to cycle through items
        </p>
      </div>

      <SocialCards cards={DEMO_CARDS} />
    </div>
  );
}
