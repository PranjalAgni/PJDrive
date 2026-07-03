interface BreadcrumbItem {
  id: string;
  name: string;
}

interface Props {
  breadcrumb: BreadcrumbItem[];
  onNavigate: (folderId: string | null) => void;
}

export function Breadcrumb({ breadcrumb, onNavigate }: Props) {
  return (
    <div style={{ marginBottom: 16, fontSize: 14 }}>
      <button
        onClick={() => onNavigate(null)}
        style={{
          background: 'none',
          border: 'none',
          color: '#1976d2',
          cursor: 'pointer',
          padding: 0,
          textDecoration: 'underline'
        }}
      >
        My Drive
      </button>
      {breadcrumb.map((item, idx) => {
        const isLast = idx === breadcrumb.length - 1;
        return (
          <span key={item.id}>
            <span style={{ margin: '0 8px', color: '#666' }}>/</span>
            {isLast ? (
              <span style={{ color: '#333' }}>{item.name}</span>
            ) : (
              <button
                onClick={() => onNavigate(item.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#1976d2',
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline'
                }}
              >
                {item.name}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
