import { motion } from 'motion/react';
import type { Variants } from 'motion/react';
import { CulturalCard } from './CulturalCard';
import { Sparkles, Brain, Heart, Zap, Users, TrendingUp, BookOpen, Eye } from 'lucide-react';

interface DashboardProps {
  onCardClick?: (category: string) => void;
}

export function Dashboard({ onCardClick }: DashboardProps) {
  const categories = [
    {
      category: 'moments',
      title: 'Moments',
      description: 'External forces and zeitgeist shaping behavior',
      icon: <Zap className="w-5 h-5" />,
      highlight: true,
      colSpan: 2,
    },
    {
      category: 'beliefs',
      title: 'Beliefs',
      description: 'Core values & operating systems',
      icon: <Brain className="w-5 h-5" />,
      colSpan: 1,
    },
    {
      category: 'tone',
      title: 'Tone & Emotion',
      description: 'Attitude, outlook & feeling states',
      icon: <Heart className="w-5 h-5" />,
      colSpan: 1,
    },
    {
      category: 'language',
      title: 'Language',
      description: 'Vernacular, symbols & codes',
      icon: <BookOpen className="w-5 h-5" />,
      colSpan: 1,
    },
    {
      category: 'behaviors',
      title: 'Behaviors',
      description: 'Actions, rituals & customs',
      icon: <TrendingUp className="w-5 h-5" />,
      colSpan: 1,
    },
    {
      category: 'contradictions',
      title: 'Contradictions',
      description: 'Emerging tensions & value shifts',
      icon: <Sparkles className="w-5 h-5" />,
      highlight: true,
      colSpan: 2,
    },
    {
      category: 'community',
      title: 'Community',
      description: 'Identity anchors & belonging',
      icon: <Users className="w-5 h-5" />,
      colSpan: 1,
    },
    {
      category: 'influencers',
      title: 'Influencers',
      description: 'Shapers of beliefs & behavior',
      icon: <Eye className="w-5 h-5" />,
      colSpan: 1,
    },
  ];

  const container: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
        delayChildren: 0.1,
      },
    },
  };

  const item: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  return (
    <div className="min-h-screen bg-zinc-950 pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-16"
        >
          <h1 className="text-4xl sm:text-5xl font-serif font-bold text-zinc-100 tracking-tight mb-3">
            Cultural Archive
          </h1>
          <p className="text-lg text-zinc-400 max-w-2xl">
            Excavate insights. Uncover patterns. Navigate the human archive.
          </p>
        </motion.div>

        {/* Bento Grid */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 auto-rows-max"
        >
          {categories.map((cat) => (
            <motion.div
              key={cat.category}
              variants={item}
              className={cat.colSpan === 2 ? 'sm:col-span-2 lg:col-span-2' : 'col-span-1'}
            >
              <CulturalCard
                category={cat.category}
                title={cat.title}
                description={cat.description}
                icon={cat.icon}
                highlight={cat.highlight}
                colSpan={cat.colSpan}
                onClick={() => onCardClick?.(cat.category)}
              />
            </motion.div>
          ))}
        </motion.div>

        {/* Footer hint */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-16 text-center text-sm text-zinc-500"
        >
          Select a category to explore deeper
        </motion.p>
      </div>
    </div>
  );
}
