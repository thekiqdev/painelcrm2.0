
import { useTheme } from "next-themes"
import { Toaster as Sonner, toast } from "sonner"
import { X } from "lucide-react"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:relative",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          closeButton:
            "group-[.toast]:opacity-100 group-[.toast]:text-foreground group-[.toast]:absolute group-[.toast]:top-2 group-[.toast]:right-2"
        },
        closeButton: true,
        actionButton: {
          label: "Fechar"
        },
      }}
      {...props}
      closeButton={
        <button className="rounded-full p-1 hover:bg-muted/80">
          <X className="h-4 w-4" />
        </button>
      }
    />
  )
}

export { Toaster, toast }
