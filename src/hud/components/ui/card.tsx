import * as React from 'react'
import { cn } from '@/lib/utils'

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'rounded-lg border bg-white shadow-sm dark:bg-gray-800 dark:border-gray-700',
      className
    )}
    {...props}
  />
))
Card.displayName = 'Card'

export { Card }