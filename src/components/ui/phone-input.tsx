
import * as React from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface PhoneInputProps extends Omit<React.ComponentProps<"input">, 'value' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
}

const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ className, value, onChange, ...props }, ref) => {
    const formatPhoneNumber = (input: string) => {
      // Remove tudo que não é número
      const numbers = input.replace(/\D/g, '');
      
      // Limita a 11 dígitos
      const limitedNumbers = numbers.slice(0, 11);
      
      // Aplica a máscara (XX) 9XXXX-XXXX
      if (limitedNumbers.length <= 2) {
        return `(${limitedNumbers}`;
      } else if (limitedNumbers.length <= 3) {
        return `(${limitedNumbers.slice(0, 2)}) ${limitedNumbers.slice(2)}`;
      } else if (limitedNumbers.length <= 7) {
        return `(${limitedNumbers.slice(0, 2)}) ${limitedNumbers.slice(2, 3)} ${limitedNumbers.slice(3)}`;
      } else {
        return `(${limitedNumbers.slice(0, 2)}) ${limitedNumbers.slice(2, 3)} ${limitedNumbers.slice(3, 7)}-${limitedNumbers.slice(7)}`;
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const formatted = formatPhoneNumber(e.target.value);
      onChange(formatted);
    };

    return (
      <Input
        type="text"
        className={cn(className)}
        value={value}
        onChange={handleChange}
        placeholder="(11) 9 9999-9999"
        ref={ref}
        {...props}
      />
    )
  }
)
PhoneInput.displayName = "PhoneInput"

export { PhoneInput }
