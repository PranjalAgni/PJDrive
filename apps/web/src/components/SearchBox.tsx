import { useEffect, useState } from 'react';

interface Props {
  onSearch: (q: string) => void;
  onClear: () => void;
}

export function SearchBox({ onSearch, onClear }: Props) {
  const [value, setValue] = useState('');

  useEffect(() => {
    const trimmed = value.trim();
    const timer = setTimeout(() => {
      if (trimmed) {
        onSearch(trimmed);
      } else {
        onClear();
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [value, onSearch, onClear]);

  return (
    <input
      type="text"
      placeholder="Search files and folders..."
      value={value}
      onChange={(e) => setValue(e.target.value)}
      style={{
        width: '100%',
        padding: '8px 12px',
        fontSize: '14px',
        border: '1px solid #ccc',
        borderRadius: '4px',
      }}
    />
  );
}
