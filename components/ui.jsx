import React from 'react';

export const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false, type = "button" }) => {
  const baseStyle = "px-4 py-2 rounded-md font-medium transition-all flex items-center justify-center gap-2 shadow-sm border";
  const variants = {
    primary: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 active:bg-blue-200",
    success: "bg-green-50 text-green-700 border-green-200 hover:bg-green-100",
    danger: "bg-red-50 text-red-700 border-red-200 hover:bg-red-100",
    secondary: "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100",
    ghost: "bg-transparent text-gray-500 border-transparent hover:bg-gray-100 shadow-none",
    action: "bg-white text-blue-600 border-blue-200 hover:bg-blue-50"
  };

  return (
    <button 
      type={type}
      onClick={onClick} 
      className={`${baseStyle} ${variants[variant]} ${className} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

export const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-lg shadow-lg border border-gray-100 p-6 ${className}`}>
    {children}
  </div>
);

export function DetailItem({ label, value, align = 'left', mono = false }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs font-bold text-slate-400">{label}</p>
      <p className={`mt-2 flex min-h-6 items-center justify-center text-center text-base font-black text-slate-800 ${mono ? 'font-mono' : ''}`}>
        {value}
      </p>
    </div>
  );
}

export function EditableDetail({ label, children }) {
  return (
    <label className="block rounded-md border border-slate-200 bg-white p-3">
      <span className="text-xs font-bold text-slate-400">{label}</span>
      {children}
    </label>
  );
}

export function EditField({ label, value, onChange, type = 'text', options = null, align = 'left', mono = false, multiline = false, disabled = false }) {
  const inputClass = `mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-sm font-bold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed ${
    align === 'right' ? 'text-right' : ''
  } ${mono ? 'font-mono' : ''}`;

  return (
    <label className="block rounded-md border border-slate-200 bg-white p-3">
      <span className="text-xs font-bold text-slate-400">{label}</span>
      {options ? (
        <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
          {options.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      ) : multiline ? (
        <textarea
          className={`${inputClass} min-h-24 resize-y font-normal`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
        />
      ) : (
        <input
          className={inputClass}
          type={type}
          value={value}
          min={type === 'number' ? 0 : undefined}
          step={type === 'number' ? 'any' : undefined}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
        />
      )}
    </label>
  );
}

export function DetailRow({ label, value, mono = false }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-400">{label}</p>
      <p className={`mt-1 break-words text-slate-700 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

export function InfoLine({ label, value, className = '', valueClassName = '', strong = false }) {
  return (
    <div className={`grid grid-cols-[72px_minmax(0,1fr)] gap-2 ${className}`}>
      <span className="text-xs font-bold text-slate-500">{label}</span>
      <span className={`min-w-0 break-words text-slate-700 ${strong ? 'font-bold' : 'font-medium'} ${valueClassName}`}>
        {value}
      </span>
    </div>
  );
}
