'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/auth/AuthContext';
import './admin.css';

const DEFAULT_FORM_DATA = {
  id: null,
  username: '',
  name: '',
  role: 'Basis Operator',
  email: '',
  password: '',
  planId: '',
  assignedSystems: ['ALL'],
};

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

  // User CRUD modal state
  const [showUserModal, setShowUserModal] = useState(false);
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const [isEditing, setIsEditing] = useState(false);
  const [submittingUser, setSubmittingUser] = useState(false);
  const [userMsg, setUserMsg] = useState(null);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingUser, setDeletingUser] = useState(false);

  // Email Notification UI state
  const [enableEmailNotifications, setEnableEmailNotifications] = useState(false);
  const [sendCriticalAfterHours, setSendCriticalAfterHours] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(15);
  const [officeHoursStart, setOfficeHoursStart] = useState('09:00');
  const [officeHoursEnd, setOfficeHoursEnd] = useState('18:00');
  const [officeHoursTimezone, setOfficeHoursTimezone] = useState('Asia/Kolkata');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState(null);

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
      const [configRes, usersRes, settingsRes] = await Promise.all([
        fetch('/api/admin/config'),
        fetch('/api/admin/users'),
        fetch('/api/admin/settings')
      ]);

      const configData = await configRes.json();
      const usersData = await usersRes.json();
      const settingsData = await settingsRes.json();

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
      if (settingsData.success) {
        setEnableEmailNotifications(settingsData.settings.enableEmailNotifications);
        setSendCriticalAfterHours(settingsData.settings.sendCriticalAfterHours);
        setRefreshInterval(settingsData.settings.refreshInterval);
        setOfficeHoursStart(settingsData.settings.officeHoursStart || '09:00');
        setOfficeHoursEnd(settingsData.settings.officeHoursEnd || '18:00');
        setOfficeHoursTimezone(settingsData.settings.officeHoursTimezone || 'Asia/Kolkata');
      }
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    setSettingsMsg(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enableEmailNotifications,
          sendCriticalAfterHours,
          refreshInterval,
          officeHoursStart,
          officeHoursEnd,
          officeHoursTimezone
        })
      });

      const data = await res.json();
      if (data.success) {
        setSettingsMsg({ type: 'success', text: 'Notification, office hours, and refresh settings saved successfully!' });
      } else {
        setSettingsMsg({ type: 'error', text: data.error || 'Failed to save settings.' });
      }
    } catch (err) {
      setSettingsMsg({ type: 'error', text: err.message });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleTileToggle = async (tileKey, isEnabled) => {
    try {
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
      fetchData();
    }
  };

  const handleUserPlanChange = async (userId, newPlanId) => {
    try {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, plan_id: newPlanId ? parseInt(newPlanId) : null } : u));

      await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, planId: newPlanId ? parseInt(newPlanId) : null })
      });
    } catch (err) {
      console.error('Failed to update user plan:', err);
      fetchData();
    }
  };

  const handleOpenCreateModal = () => {
    setFormData({
      ...DEFAULT_FORM_DATA,
      planId: plans.length > 0 ? plans[0].id : '',
      assignedSystems: ['ALL'],
    });
    setIsEditing(false);
    setUserMsg(null);
    setShowUserModal(true);
  };

  const handleOpenEditModal = (u) => {
    const sysArr = (!u.assigned_systems || u.assigned_systems === 'ALL')
      ? ['ALL']
      : u.assigned_systems.split(',');

    setFormData({
      id: u.id,
      username: u.username || '',
      name: u.name || '',
      role: u.role || 'Basis Operator',
      email: u.email || '',
      password: '',
      planId: u.plan_id || '',
      assignedSystems: sysArr,
    });
    setIsEditing(true);
    setUserMsg(null);
    setShowUserModal(true);
  };

  const handleSystemToggle = (sys) => {
    setFormData(prev => {
      let current = [...(prev.assignedSystems || ['ALL'])];
      if (sys === 'ALL') {
        return { ...prev, assignedSystems: ['ALL'] };
      }
      
      // If currently ALL, clear ALL when checking specific system
      if (current.includes('ALL')) {
        current = [];
      }

      if (current.includes(sys)) {
        current = current.filter(s => s !== sys);
      } else {
        current.push(sys);
      }

      // If no system checked or all 4 systems checked (MSD, MSP, MGP, SPA), revert to ALL
      const allFour = ['MSD', 'MSP', 'MGP', 'SPA'];
      if (current.length === 0 || allFour.every(s => current.includes(s))) {
        current = ['ALL'];
      }
      return { ...prev, assignedSystems: current };
    });
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    setSubmittingUser(true);
    setUserMsg(null);

    try {
      const method = isEditing ? 'PUT' : 'POST';
      const response = await fetch('/api/admin/users', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (data.success) {
        setUserMsg({
          type: 'success',
          text: isEditing ? 'User updated successfully!' : 'New user created successfully!',
        });
        fetchData();
        setTimeout(() => {
          setShowUserModal(false);
          setUserMsg(null);
        }, 1200);
      } else {
        setUserMsg({ type: 'error', text: data.error || 'Failed to save user.' });
      }
    } catch (err) {
      setUserMsg({ type: 'error', text: err.message });
    } finally {
      setSubmittingUser(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;

    if (user && (user.username === deleteTarget.username || user.userId === deleteTarget.username)) {
      setUserMsg({ type: 'error', text: 'You cannot delete your own currently logged-in admin account.' });
      setDeleteTarget(null);
      return;
    }

    setDeletingUser(true);
    try {
      const response = await fetch(`/api/admin/users?id=${deleteTarget.id}`, {
        method: 'DELETE',
      });
      const data = await response.json();

      if (data.success) {
        setUsers(prev => prev.filter(u => u.id !== deleteTarget.id));
        setDeleteTarget(null);
      } else {
        alert(data.error || 'Failed to delete user.');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingUser(false);
    }
  };

  if (authLoading || loading) {
    return <div className="admin-loading">Loading Admin Data...</div>;
  }

  if (!user || user.role !== 'Lead Administrator') {
    return null;
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
          Users
        </button>
        <button
          className={`tab-btn ${activeTab === 'email' ? 'active' : ''}`}
          onClick={() => setActiveTab('email')}
        >
          Email Notification
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
            <div className="users-tab-header">
              <div>
                <h2>User Management</h2>
                <p>Create, edit, and manage access credentials and assigned plans for SAP Basis administrators and operators.</p>
              </div>
              <button className="add-user-btn" onClick={handleOpenCreateModal}>
                + Add New User
              </button>
            </div>

            <table className="users-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Email ID</th>
                  <th>Assigned Plan</th>
                  <th>Assigned Systems</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <span className="user-username">{u.username}</span>
                    </td>
                    <td>{u.name}</td>
                    <td>
                      <span className={`role-badge ${u.role === 'Lead Administrator' ? 'role-admin' : 'role-operator'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td>{u.email || '—'}</td>
                    <td>
                      <select
                        value={u.plan_id || ''}
                        onChange={(e) => handleUserPlanChange(u.id, e.target.value)}
                        className="plan-select-inline"
                      >
                        <option value="">None</option>
                        {plans.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className="assigned-systems-pills">
                        {(!u.assigned_systems || u.assigned_systems === 'ALL') ? (
                          <span className="system-pill pill-all">All Systems</span>
                        ) : (
                          u.assigned_systems.split(',').map(sys => (
                            <span key={sys} className="system-pill">{sys}</span>
                          ))
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="user-actions">
                        <button className="action-btn edit-btn" onClick={() => handleOpenEditModal(u)}>
                          Edit
                        </button>
                        <button 
                          className="action-btn delete-btn" 
                          onClick={() => setDeleteTarget(u)}
                          disabled={user && (user.username === u.username || user.userId === u.username)}
                          title={user && (user.username === u.username || user.userId === u.username) ? "Cannot delete your own account" : "Delete user"}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'email' && (
          <div className="tab-pane">
            <div className="email-tab-header">
              <h2>Email Notification Settings</h2>
              <p>Configure automated email notification preferences and dashboard refresh behavior.</p>
            </div>

            <div className="email-settings-card">
              {settingsMsg && (
                <div className={`modal-msg ${settingsMsg.type}`} style={{ margin: '0 0 16px 0' }}>
                  {settingsMsg.text}
                </div>
              )}

              <div className="setting-item">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={enableEmailNotifications}
                    onChange={(e) => setEnableEmailNotifications(e.target.checked)}
                  />
                  <span>Enable Email Notifications for Users</span>
                </label>
              </div>

              <div className="setting-item">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={sendCriticalAfterHours}
                    onChange={(e) => setSendCriticalAfterHours(e.target.checked)}
                  />
                  <span>Send Notification for critical alerts after office hours</span>
                </label>
              </div>

              <div className="office-hours-section">
                <h4 style={{ margin: '8px 0 4px 0', fontSize: '14px', color: '#333' }}>Office Hours Window</h4>
                <div className="form-row">
                  <div className="form-group">
                    <label>Start Time</label>
                    <input
                      type="time"
                      value={officeHoursStart}
                      onChange={(e) => setOfficeHoursStart(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>End Time</label>
                    <input
                      type="time"
                      value={officeHoursEnd}
                      onChange={(e) => setOfficeHoursEnd(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: '8px' }}>
                  <label>Timezone</label>
                  <select
                    value={officeHoursTimezone}
                    onChange={(e) => setOfficeHoursTimezone(e.target.value)}
                  >
                    <option value="Asia/Kolkata">Asia/Kolkata (IST - UTC+05:30)</option>
                    <option value="UTC">UTC (Coordinated Universal Time)</option>
                    <option value="America/New_York">America/New_York (EST - UTC-05:00)</option>
                    <option value="Europe/London">Europe/London (GMT/BST)</option>
                    <option value="Europe/Berlin">Europe/Berlin (CET - UTC+01:00)</option>
                    <option value="Asia/Singapore">Asia/Singapore (SGT - UTC+08:00)</option>
                  </select>
                </div>
              </div>

              <div className="setting-item dropdown-item">
                <label className="select-label">Refresh dashboard data after every n mins</label>
                <select
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(Number(e.target.value))}
                  className="refresh-interval-select"
                >
                  <option value={15}>15 mins</option>
                  <option value={30}>30 mins</option>
                  <option value={45}>45 mins</option>
                  <option value={60}>60 mins</option>
                </select>
              </div>

              <div className="setting-actions" style={{ marginTop: '12px' }}>
                <button
                  type="button"
                  className="save-btn"
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                >
                  {savingSettings ? 'Saving Settings...' : 'Save Settings'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CREATE / EDIT USER MODAL */}
      {showUserModal && (
        <div className="modal-backdrop" onClick={() => setShowUserModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{isEditing ? 'Edit User Details' : 'Create New User'}</h3>
              <button className="modal-close" onClick={() => setShowUserModal(false)}>&times;</button>
            </div>

            {userMsg && (
              <div className={`modal-msg ${userMsg.type}`}>
                {userMsg.text}
              </div>
            )}

            <form onSubmit={handleSaveUser} className="user-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Username *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. operator2"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Basis Operator"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Role *</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  >
                    <option value="Lead Administrator">Lead Administrator</option>
                    <option value="Basis Operator">Basis Operator</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Email ID</label>
                  <input
                    type="email"
                    placeholder="e.g. operator@company.sap"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>{isEditing ? 'New Password (leave blank to keep current)' : 'Password *'}</label>
                  <input
                    type="password"
                    required={!isEditing}
                    placeholder={isEditing ? '••••••••' : 'Enter login password'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Assigned Plan</label>
                  <select
                    value={formData.planId || ''}
                    onChange={(e) => setFormData({ ...formData, planId: e.target.value })}
                  >
                    <option value="">None</option>
                    {plans.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label>Assigned Systems</label>
                <div className="systems-checkbox-grid">
                  <label className="checkbox-label inline-checkbox">
                    <input
                      type="checkbox"
                      checked={formData.assignedSystems?.includes('ALL')}
                      onChange={() => handleSystemToggle('ALL')}
                    />
                    <span>All Systems</span>
                  </label>
                  {['MSD', 'MSP', 'MGP', 'SPA'].map(sys => {
                    const isChecked = !formData.assignedSystems?.includes('ALL') && formData.assignedSystems?.includes(sys);
                    return (
                      <label key={sys} className="checkbox-label inline-checkbox">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleSystemToggle(sys)}
                        />
                        <span>{sys}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="cancel-btn" onClick={() => setShowUserModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="save-user-btn" disabled={submittingUser}>
                  {submittingUser ? 'Saving...' : isEditing ? 'Update User' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteTarget && (
        <div className="modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="modal-card modal-delete" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Confirm Delete User</h3>
              <button className="modal-close" onClick={() => setDeleteTarget(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete user <strong>{deleteTarget.name}</strong> (<code>{deleteTarget.username}</code>)?</p>
              <p className="warn-text">This action cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button className="cancel-btn" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="confirm-delete-btn" onClick={handleDeleteUser} disabled={deletingUser}>
                {deletingUser ? 'Deleting...' : 'Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
