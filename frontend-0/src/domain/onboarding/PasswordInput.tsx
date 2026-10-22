import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, 'type'> & {
  revealLabel: string;
};

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ revealLabel, className, ...props }, ref) => {
    const [visible, setVisible] = useState(false);
    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? 'text' : 'password'}
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className={cn('pr-10', className)}
          {...props}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0 h-full rounded-l-none text-muted-foreground hover:text-foreground"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? `Hide ${revealLabel}` : `Show ${revealLabel}`}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
    );
  }
);
PasswordInput.displayName = 'PasswordInput';
