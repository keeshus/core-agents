import { useState, useId } from 'react';
import { Icon } from '@/components/ui/Icon';

interface TextFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  error?: string;
  helpText?: string;
  multiline?: boolean;
  rows?: number;
  disabled?: boolean;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  inputRef?: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  error,
  helpText,
  multiline,
  rows = 3,
  disabled,
  className = '',
  onKeyDown,
  onFocus,
  onBlur,
  inputRef,
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const hasValue = value.length > 0;
  const float = focused || hasValue;
  const inputId = useId();

  const Tag = multiline ? 'textarea' : 'input';

  return (
    <div className={`relative ${className}`}>
      <div className={`rounded-t bg-surface-container-high border-b-2 transition-colors ${
        error ? 'border-error' : focused ? 'border-primary' : 'border-outline-variant'
      } ${multiline ? '' : 'flex items-center'}`}>
        <Tag
          id={label ? inputId : undefined}
          ref={inputRef as any}
          type={multiline ? undefined : type}
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          placeholder={placeholder || (label ? ' ' : undefined)}
          rows={multiline ? rows : undefined}
          disabled={disabled}
          onKeyDown={onKeyDown}
          className={`w-full bg-transparent text-on-surface outline-none px-4 transition-all ${
            multiline ? 'pt-5 pb-3 text-sm resize-y' : label ? `${float ? 'pt-5 pb-2' : 'py-2'} text-sm` : 'py-2 text-sm'
          } ${disabled ? 'opacity-40' : ''}`}
        />
      </div>

      {label && (
        <label htmlFor={inputId} className={`absolute left-4 transition-all pointer-events-none ${
          float
            ? 'text-[10px] top-1.5 text-on-surface-variant'
            : 'text-sm top-2 text-outline'
        } ${error ? '!text-error' : focused ? '!text-primary' : ''}`}>
          {label}
        </label>
      )}

      {error && (
        <div className="flex items-center gap-1 mt-1">
          <Icon name="error" className="text-xs text-error" />
          <p className="text-xs text-error">{error}</p>
        </div>
      )}
      {helpText && !error && (
        <p className="text-xs text-on-surface-variant mt-1">{helpText}</p>
      )}
    </div>
  );
}
