
"use client"

type InputFieldProps = {
  label?: string;
  name: string;
  type?: 'text' | 'email' | 'tel' | 'number' | 'password';
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

type TextAreaFieldProps = {
  label?: string;
  name: string;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onBlur?: () => void;
  error?: string;
  required?: boolean;
  rows?: number;
  disabled?: boolean;
  className?: string;
}

export function InputField({
  label,
  name,
  type = 'text',
  placeholder,
  value,
  onChange,
  onBlur,
  error,
  required = true,
  disabled = false,
  className = ''
}: InputFieldProps) {
  return (
    <div className={`flex flex-col ${className}`}>
      {label && (
        <label htmlFor={name} className="text-sm font-medium text-white mb-2 flex items-center gap-1">
          {label}
          {required && <span className="text-[#F58595] text-lg">*</span>}
        </label>
      )}
      {!label && required && (
        <div className="text-xs font-medium text-gray-700 mb-2">
          <span className="text-[#F58595] text-lg">*</span>
        </div>
      )}
      <input
        id={name}
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        className={`px-2 py-1 bg-[#E5E7EB] rounded-lg text-black placeholder-[#7D7F86] focus:outline-none focus:ring-2 focus:ring-black/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
          error ? 'ring-1 ring-[#F58595]' : ''
        }`}
      />
      {error && (
        <span className="text-[#F58595] text-xs mt-1">{error}</span>
      )}
    </div>
  );
}


export function TextAreaField({
  label,
  name,
  placeholder,
  value,
  onChange,
  onBlur,
  error,
  required = true,
  rows = 6,
  disabled = false,
  className = ''
}: TextAreaFieldProps) {
  return (
    <div className={`flex flex-col ${className}`}>
      {label && (
        <label htmlFor={name} className="text-sm font-medium text-white mb-2 flex items-center gap-1">
          {label}
          {required && <span className="text-[#F58595] text-lg">*</span>}
        </label>
      )}
      {!label && required && (
        <div className="text-xs font-medium text-gray-700 mb-2">
          <span className="text-[#F58595] text-lg">*</span>
        </div>
      )}
      <textarea
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={`px-2 py-1 bg-[#E5E7EB] rounded-lg text-black placeholder-[#7D7F86] focus:outline-none focus:ring-2 focus:ring-black/50 transition-all resize-none disabled:opacity-50 disabled:cursor-not-allowed ${
          error ? 'ring-1 ring-[#F58595]' : ''
        }`}
      />
      {error && (
        <span className="text-[#F58595] text-xs mt-1">{error}</span>
      )}
    </div>
  );
}