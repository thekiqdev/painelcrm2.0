
import * as React from "react"
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react"

import { cn } from "@/lib/utils"
import { ButtonProps, buttonVariants } from "@/components/ui/button"

const Pagination = ({ className, ...props }: React.ComponentProps<"nav">) => (
  <nav
    role="navigation"
    aria-label="pagination"
    className={cn("mx-auto flex w-full justify-center", className)}
    {...props}
  />
)
Pagination.displayName = "Pagination"

const PaginationContent = React.forwardRef<
  HTMLUListElement,
  React.ComponentProps<"ul">
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    className={cn("flex flex-row items-center gap-1", className)}
    {...props}
  />
))
PaginationContent.displayName = "PaginationContent"

const PaginationItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentProps<"li">
>(({ className, ...props }, ref) => (
  <li ref={ref} className={cn("", className)} {...props} />
))
PaginationItem.displayName = "PaginationItem"

type PaginationLinkProps = {
  isActive?: boolean
  onClick?: () => void
} & Pick<ButtonProps, "size"> &
  Omit<React.ComponentProps<"button">, "size" | "onClick">

const PaginationLink = ({
  className,
  isActive,
  size = "icon",
  onClick,
  ...props
}: PaginationLinkProps) => (
  <button
    onClick={onClick}
    type="button"
    aria-current={isActive ? "page" : undefined}
    className={cn(
      buttonVariants({
        variant: isActive ? "outline" : "ghost",
        size,
      }),
      className
    )}
    {...props}
  />
)
PaginationLink.displayName = "PaginationLink"

type PaginationButtonProps = {
  onClick?: () => void
  className?: string
  "aria-disabled"?: boolean
} & Omit<React.ComponentProps<"button">, "onClick" | "className">

const PaginationPrevious = ({
  className,
  onClick,
  ...props
}: PaginationButtonProps) => (
  <button
    onClick={onClick}
    aria-label="Go to previous page"
    className={cn(
      buttonVariants({ variant: "ghost", size: "default" }), 
      "gap-1 pl-2.5", 
      className
    )}
    {...props}
  >
    <ChevronLeft className="h-4 w-4" />
    <span>Previous</span>
  </button>
)
PaginationPrevious.displayName = "PaginationPrevious"

const PaginationNext = ({
  className,
  onClick,
  ...props
}: PaginationButtonProps) => (
  <button
    onClick={onClick}
    aria-label="Go to next page"
    className={cn(
      buttonVariants({ variant: "ghost", size: "default" }), 
      "gap-1 pr-2.5", 
      className
    )}
    {...props}
  >
    <span>Next</span>
    <ChevronRight className="h-4 w-4" />
  </button>
)
PaginationNext.displayName = "PaginationNext"

const PaginationEllipsis = ({
  className,
  ...props
}: React.ComponentProps<"span">) => (
  <span
    aria-hidden
    className={cn("flex h-9 w-9 items-center justify-center", className)}
    {...props}
  >
    <MoreHorizontal className="h-4 w-4" />
    <span className="sr-only">More pages</span>
  </span>
)
PaginationEllipsis.displayName = "PaginationEllipsis"

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
}
