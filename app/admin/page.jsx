'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/auth/AuthContext';
import './admin.css';

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [checks, setChecks] = useState([]);
  const [planTiles, setPlanTiles] = useState([]);
  const [users, setUsers] = useState([]);
  
  const [activeTab, setActiveTab] = useState('tiles');
  const [selectedPlanId, setSelectedPlanId] = useState(null);

  useEffect(() => {
    if (!authLoading) {
      if (!user || user.role !== 'Lead Administrator') {
        router.push('/');
      } else {
        fetchData();
      }
    }
  }, [user, authLoading, router]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [configRes, usersRes] = await Promise.all([
        fetch('/api/admin/config'),
        fetch('/api/admin/users')
      ]);

      const configData = await configRes.json();
      const usersData = await usersRes.json();

      if (configData.success) {
        setPlans(configData.plans);
        setChecks(configData.checks);
        setPlanTiles(configData.planTiles);
        if (configData.plans.length > 0) {
          setSelectedPlanId(configData.plans[0].id);
        }
      }
      if (usersData.success) {
        setUsers(usersData.users);
      }
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTileToggle = async (tileKey, isEnabled) => {
    try {
      // Optimistic update
      setPlanTiles(prev => {
        const existing = prev.find(pt => pt.plan_id === selectedPlanId && pt.tile_key === tileKey);
        if (existing) {
          return prev.map(pt => pt.plan_id === selectedPlanId && pt.tile_key === tileKey ? { ...pt, is_enabled: isEnabled } : pt);
        } else {
          return [...prev, { plan_id: selectedPlanId, tile_key: tileKey, is_enabled: isEnabled }];
        }
      });

      await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: selectedPlanId, tileKey, isEnabled })
      });
    } catch (err) {
      console.error('Failed to update tile:', err);
      // Revert on error (could implement more robust rollback here)
      fetchData();
    }
  };

  const handleUserPlanChange = async (userId, newPlanId) => {
    try {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, plan_id: parseInt(newPlanId) } : u));
      
      await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, planId: parseInt(newPlanId) })
      });
    } catch (err) {
      console.error('Failed to update user plan:', err);
      fetchData();
    }
  };

  if (authLoading || loading) {
    return <div className="admin-loading">Loading Admin Data...</div>;
  }

  if (!user || user.role !== 'Lead Administrator') {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="admin-container">
      <header className="admin-header">
        <h1>Dashboard Admin Settings</h1>
        <button className="back-btn" onClick={() => router.push('/')}>&larr; Back to Dashboard</button>
      </header>

      <div className="admin-tabs">
        <button 
          className={`tab-btn ${activeTab === 'tiles' ? 'active' : ''}`}
          onClick={() => setActiveTab('tiles')}
        >
          Plan & Tile Configuration
        </button>
        <button 
          className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          User Assignment
        </button>
      </div>

      <div className="admin-content">
        {activeTab === 'tiles' && (
          <div className="tab-pane">
            <div className="plan-selector">
              <label>Select Plan:</label>
              <select 
                value={selectedPlanId || ''} 
                onChange={(e) => setSelectedPlanId(parseInt(e.target.value))}
              >
                {plans.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            
            <div className="tiles-grid">
              {checks.map(check => {
                const pt = planTiles.find(pt => pt.plan_id === selectedPlanId && pt.tile_key === check.key);
                const isEnabled = pt ? pt.is_enabled : false;
                
                return (
                  <label key={check.key} className={`tile-toggle ${isEnabled ? 'enabled' : 'disabled'}`}>
                    <input 
                      type="checkbox" 
                      checked={isEnabled}
                      onChange={(e) => handleTileToggle(check.key, e.target.checked)}
                    />
                    <div className="tile-info">
                      <span className="tile-key">{check.key}</span>
                      <span className="tile-label">{check.label}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="tab-pane">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Assigned Plan</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>{u.username}</td>
                    <td>{u.name}</td>
                    <td>{u.role}</td>
                    <td>
                      <select 
                        value={u.plan_id || ''}
                        onChange={(e) => handleUserPlanChange(u.id, e.target.value)}
                      >
                        <option value="">None</option>
                        {plans.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
