'use client';

import { statusOf } from '../lib/status.js';

export function MetricsListView({
  tiles,
  favoriteTiles = [],
  favorites = [],
  onToggleFavorite,
  onOpenDetail,
}) {
  return (
    <div className="metrics-list-wrapper">
      {/* FAVORITES LIST SECTION (if any favorites) */}
      {favoriteTiles.length > 0 && (
        <div className="favorites-list-block">
          <div className="favorites-list-header">
            <div className="favorites-title-wrap">
              <svg viewBox="0 0 24 24" fill="#f59e0b" width="18" height="18" aria-hidden="true">
                <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
              <h3 className="favorites-list-title">Pinned Favorites</h3>
              <span className="favorites-badge">{favoriteTiles.length}</span>
            </div>
          </div>
          <div className="metrics-list-container favorites-list-container">
            {favoriteTiles.map((tile) => (
              <MetricRowItem
                key={`fav-row-${tile.key}`}
                tile={tile}
                isFavorite={true}
                onToggleFavorite={onToggleFavorite}
                onOpenDetail={onOpenDetail}
              />
            ))}
          </div>
        </div>
      )}

      {/* ALL METRICS LIST SECTION */}
      <div className="all-metrics-list-block">
        <div className="list-block-header">
          <h3 className="all-metrics-title">All Metrics ({tiles.length})</h3>
        </div>

        {tiles.length === 0 ? (
          <div className="card state-panel" style={{ padding: '36px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: '15px', color: 'var(--text-primary)' }}>
              <strong>No metrics match the current priority filter.</strong>
            </p>
          </div>
        ) : (
          <div className="metrics-list-wrapper-card">
            {/* List Table Header */}
            <div className="mlist-header-row" aria-hidden="true">
              <span className="mlist-col col-status">Status</span>
              <span className="mlist-col col-name">Metric Name</span>
              <span className="mlist-col col-value">Reading Value</span>
              <span className="mlist-col col-note">Details & Context</span>
              <span className="mlist-col col-actions">Actions</span>
            </div>

            {/* List Rows */}
            <div className="metrics-list-rows">
              {tiles.map((tile) => (
                <MetricRowItem
                  key={`row-${tile.key}`}
                  tile={tile}
                  isFavorite={favorites.includes(tile.key)}
                  onToggleFavorite={onToggleFavorite}
                  onOpenDetail={onOpenDetail}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricRowItem({ tile, isFavorite, onToggleFavorite, onOpenDetail }) {
  const meta = statusOf(tile.status);
  const canOpen = Boolean(tile.detail) && typeof onOpenDetail === 'function';

  // Category classifier based on key prefix or properties
  let category = 'Metric';
  let categoryClass = 'cat-metric';
  if (tile.key.includes('vol') || tile.key.includes('free')) {
    category = 'Storage';
    categoryClass = 'cat-storage';
  } else if (tile.key.startsWith('endpoint-')) {
    category = 'Endpoint';
    categoryClass = 'cat-endpoint';
  } else if (tile.osStatus) {
    category = 'OS Health';
    categoryClass = 'cat-os';
  } else {
    category = 'System Check';
    categoryClass = 'cat-check';
  }

  return (
    <div
      className={`mlist-card-row ${canOpen ? 'is-clickable' : ''}`}
      style={{ '--status-accent': meta.color }}
      onClick={() => canOpen && onOpenDetail(tile)}
      tabIndex={canOpen ? 0 : undefined}
      role={canOpen ? 'button' : undefined}
      onKeyDown={(e) => {
        if (canOpen && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onOpenDetail(tile);
        }
      }}
    >
      {/* STATUS COLUMN */}
      <div className="mlist-col col-status">
        <span
          className={`mlist-status-pill status-${tile.status || 'ok'}`}
          style={{
            color: meta.color,
            backgroundColor: `${meta.color}15`,
            borderColor: `${meta.color}35`,
          }}
        >
          <span className="mlist-status-dot" style={{ backgroundColor: meta.color }} />
          <span className="mlist-status-label">{meta.word}</span>
        </span>
      </div>

      {/* METRIC NAME COLUMN */}
      <div className="mlist-col col-name">
        <div className="mlist-name-wrap">
          <span className="mlist-name-title">{tile.label}</span>
          <span className={`mlist-category-pill ${categoryClass}`}>{category}</span>
        </div>
      </div>

      {/* READING VALUE COLUMN */}
      <div className="mlist-col col-value">
        <div className="mlist-value-text">
          <span className="mlist-val">{tile.value}</span>
          {tile.unit && <span className="mlist-unit">{tile.unit}</span>}
        </div>
      </div>

      {/* DETAILS / NOTES COLUMN */}
      <div className="mlist-col col-note">
        <div className="mlist-note-text">
          <svg className="mlist-note-icon" viewBox="0 0 20 20" fill="currentColor" width="14" height="14" aria-hidden="true">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.25v3.75H9a.75.75 0 000 1.5h2.5a.75.75 0 000-1.5h-.25V9.75A.75.75 0 0010.5 9H9z" clipRule="evenodd" />
          </svg>
          <span>{tile.note || tile.hint || 'All parameters operational'}</span>
        </div>
      </div>

      {/* ACTIONS COLUMN */}
      <div className="mlist-col col-actions" onClick={(e) => e.stopPropagation()}>
        {onToggleFavorite && (
          <button
            type="button"
            className={`mlist-star-btn ${isFavorite ? 'active' : ''}`}
            onClick={() => onToggleFavorite(tile.key)}
            title={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
            aria-label={isFavorite ? `Remove ${tile.label} from Favorites` : `Add ${tile.label} to Favorites`}
          >
            <svg
              viewBox="0 0 24 24"
              fill={isFavorite ? '#f59e0b' : 'none'}
              stroke={isFavorite ? '#f59e0b' : 'currentColor'}
              strokeWidth="2"
              width="16"
              height="16"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
              />
            </svg>
          </button>
        )}
        {canOpen && (
          <button
            type="button"
            className="mlist-detail-btn"
            onClick={() => onOpenDetail(tile)}
            title="View Details"
          >
            <span>Details</span>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
