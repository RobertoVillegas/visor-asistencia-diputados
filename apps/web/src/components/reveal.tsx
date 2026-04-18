import type { ReactNode } from "react"

import { AnimatePresence, motion, MotionConfig } from "motion/react"

const easeOut = [0.16, 1, 0.3, 1] as const

export function PageMotion({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}

export function FadeIn({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={className}
      initial={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.22, ease: easeOut, delay }}
    >
      {children}
    </motion.div>
  )
}

export function SwappableContent({
  children,
  contentKey,
}: {
  children: ReactNode
  contentKey: string
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={contentKey}
        animate={{ opacity: 1, y: 0 }}
        initial={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.18, ease: easeOut }}
        exit={{ opacity: 0, y: -6 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

export function StaggerList({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <motion.div
      animate="show"
      className={className}
      initial="hidden"
      variants={{
        hidden: {},
        show: {
          transition: {
            staggerChildren: 0.05,
          },
        },
      }}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 10 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.22, ease: easeOut },
        },
      }}
    >
      {children}
    </motion.div>
  )
}
