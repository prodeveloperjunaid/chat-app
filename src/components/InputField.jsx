import React from 'react';
import { useField } from 'formik';

export default function InputField({ label, icon, ...props }) {
  const [field, meta] = useField(props);
  const hasError = meta.touched && Boolean(meta.error);

  return (
    <div>
      {label && (
        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          {...field}
          {...props}
          className={`w-full px-4 py-2.5 ${icon ? 'pl-10' : 'pl-4'} rounded-xl bg-gray-50 border text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:bg-white focus:ring-2 transition-all ${
            hasError
              ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
              : 'border-gray-300 focus:border-blue-600 focus:ring-blue-500/20'
          }`}
        />
        {icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
            {icon}
          </div>
        )}
      </div>
      {hasError && (
        <p className="text-xs text-red-500 mt-1 font-medium">{meta.error}</p>
      )}
    </div>
  );
}
