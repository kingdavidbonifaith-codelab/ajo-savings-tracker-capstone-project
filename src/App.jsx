import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import GroupList from './components/GroupList';
import GroupDetail from './components/GroupDetail';
import CreateGroupModal from './components/CreateGroupModal';
import LogPaymentModal from './components/LogPaymentModal';
import ReceiptModal from './components/ReceiptModal';
import SwapPositionModal from './components/SwapPositionModal';
import AuditLog from './components/AuditLog';
import Toast from './components/Toast';

import { initialCalabarGroups, initialAuditLogs } from './data/initialData';

export default function App() {
  const [groups, setGroups] = useState(() => {
    const saved = localStorage.getItem('calabar_ajo_groups');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return initialCalabarGroups;
  });

  const [logs, setLogs] = useState(() => {
    const saved = localStorage.getItem('calabar_ajo_logs');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return initialAuditLogs;
  });

  const [activeNav, setActiveNav] = useState('dashboard'); // 'dashboard', 'groups', 'audit', or group id
  const [selectedGroupId, setSelectedGroupId] = useState(null);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [logPaymentGroup, setLogPaymentGroup] = useState(null);
  const [receiptData, setReceiptData] = useState(null);
  const [swapGroup, setSwapGroup] = useState(null);

  // Toast
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  // Sync state to localStorage
  useEffect(() => {
    localStorage.setItem('calabar_ajo_groups', JSON.stringify(groups));
  }, [groups]);

  useEffect(() => {
    localStorage.setItem('calabar_ajo_logs', JSON.stringify(logs));
  }, [logs]);

  // Log action helper
  const addAuditLog = (groupName, action, detail) => {
    const newEntry = {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      groupName,
      action,
      detail
    };
    setLogs(prev => [newEntry, ...prev]);
  };

  // Reset demo data
  const handleResetDemoData = () => {
    if (window.confirm('Reset all Calabar Ajo groups to original demo state?')) {
      setGroups(initialCalabarGroups);
      setLogs(initialAuditLogs);
      localStorage.removeItem('calabar_ajo_groups');
      localStorage.removeItem('calabar_ajo_logs');
      showToast('Restored default Calabar demo data successfully!', 'info');
    }
  };

  // Create new group
  const handleCreateGroup = (newGroup) => {
    setGroups(prev => [newGroup, ...prev]);
    addAuditLog(newGroup.name, 'Create Group', `Created new Ajo group in ${newGroup.hubLocation} with ${newGroup.members.length} members.`);
    showToast(`Created ${newGroup.name} successfully!`);
  };

  // Log Payment submit
  const handleSubmitPayment = ({ groupId, cycleIndex, memberId, channel, ref, proofNote, status }) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;

      const member = g.members.find(m => m.id === memberId);
      const memberName = member ? member.name : 'Member';

      const currentCycleContribs = g.contributions[cycleIndex] || [];
      // Remove existing record for this member if any
      const updatedContribs = currentCycleContribs.filter(c => c.memberId !== memberId);

      const newRecord = {
        memberId,
        status: status || 'Verified',
        date: new Date().toISOString().split('T')[0],
        channel,
        ref,
        proofNote
      };

      updatedContribs.push(newRecord);

      addAuditLog(g.name, status === 'Verified' ? 'Verify Contribution' : 'Log Payment', `${memberName} logged payment of ₦${g.contributionAmount.toLocaleString()} via ${channel} (${ref}).`);

      return {
        ...g,
        contributions: {
          ...g.contributions,
          [cycleIndex]: updatedContribs
        }
      };
    }));

    showToast('Logged contribution payment successfully!');
  };

  // Trustee Confirm Verification
  const handleVerifyPayment = (groupId, memberId) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;

      const member = g.members.find(m => m.id === memberId);
      const cycleContribs = g.contributions[g.currentCycleIndex] || [];

      const updatedContribs = cycleContribs.map(c => {
        if (c.memberId === memberId) {
          return { ...c, status: 'Verified', date: new Date().toISOString().split('T')[0] };
        }
        return c;
      });

      addAuditLog(g.name, 'Verify Contribution', `Trustee verified payment for ${member?.name}.`);
      return {
        ...g,
        contributions: {
          ...g.contributions,
          [g.currentCycleIndex]: updatedContribs
        }
      };
    }));

    showToast('Contribution status set to Verified!');
  };

  // Swap turns
  const handleSwapSubmit = ({ groupId, member1Id, member2Id, reason }) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;

      const m1 = g.members.find(m => m.id === member1Id);
      const m2 = g.members.find(m => m.id === member2Id);
      if (!m1 || !m2) return g;

      // Swap positions
      const pos1 = m1.position;
      const pos2 = m2.position;

      const updatedMembers = g.members.map(m => {
        if (m.id === member1Id) return { ...m, position: pos2 };
        if (m.id === member2Id) return { ...m, position: pos1 };
        return m;
      }).sort((a, b) => a.position - b.position);

      // Re-assign payout schedule recipients based on position
      const updatedSchedule = g.payoutSchedule.map(item => {
        const matchingMember = updatedMembers.find(m => m.position === item.cycle);
        return {
          ...item,
          memberId: matchingMember ? matchingMember.id : item.memberId
        };
      });

      addAuditLog(g.name, 'Swap Request', `Swapped turn #${pos1} (${m1.name}) with turn #${pos2} (${m2.name}). Reason: ${reason}`);

      return {
        ...g,
        members: updatedMembers,
        payoutSchedule: updatedSchedule
      };
    }));

    showToast('Payout rotation positions swapped!');
  };

  // Disburse Payout
  const handleDisbursePayout = (groupId, cycleIndex) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;

      const currentScheduleItem = g.payoutSchedule.find(s => s.cycle === cycleIndex);
      const recipient = g.members.find(m => m.id === currentScheduleItem?.memberId);

      const updatedSchedule = g.payoutSchedule.map(s => {
        if (s.cycle === cycleIndex) {
          return {
            ...s,
            status: 'Disbursed',
            ref: `PAY-CALABAR-${Date.now()}`
          };
        }
        return s;
      });

      addAuditLog(g.name, 'Payout Disbursed', `Disbursed ₦${currentScheduleItem?.amount.toLocaleString()} lump sum to ${recipient?.name} (${recipient?.bank}).`);

      return {
        ...g,
        payoutSchedule: updatedSchedule
      };
    }));

    showToast('Lump-sum payout disbursed successfully!');
  };

  // Select Group
  const handleSelectGroup = (id) => {
    setSelectedGroupId(id);
    setActiveNav('group-detail');
  };

  const selectedGroup = groups.find(g => g.id === selectedGroupId);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar 
        activeTab={activeNav}
        setActiveTab={(tab) => {
          setActiveNav(tab);
          if (tab !== 'group-detail') setSelectedGroupId(null);
        }}
        onOpenCreateModal={() => setIsCreateModalOpen(true)}
        onResetDemoData={handleResetDemoData}
      />

      <main className="app-container" style={{ flex: 1 }}>
        {activeNav === 'dashboard' && (
          <Dashboard 
            groups={groups} 
            onSelectGroup={handleSelectGroup}
            onOpenCreateModal={() => setIsCreateModalOpen(true)}
            logs={logs}
            onViewReceipt={(receipt) => setReceiptData(receipt)}
          />
        )}

        {activeNav === 'groups' && (
          <GroupList 
            groups={groups}
            onSelectGroup={handleSelectGroup}
            onOpenCreateModal={() => setIsCreateModalOpen(true)}
          />
        )}

        {activeNav === 'audit' && (
          <AuditLog logs={logs} />
        )}

        {activeNav === 'group-detail' && selectedGroup && (
          <GroupDetail 
            group={selectedGroup}
            onBack={() => setActiveNav('groups')}
            onLogPayment={(g) => setLogPaymentGroup(g)}
            onVerifyPayment={handleVerifyPayment}
            onViewReceipt={(receipt) => setReceiptData(receipt)}
            onOpenSwapModal={(g) => setSwapGroup(g)}
            onDisbursePayout={handleDisbursePayout}
          />
        )}
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--border-card)',
        background: 'rgba(11, 19, 32, 0.9)',
        padding: '1.5rem 1.25rem',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: '0.8rem'
      }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <strong style={{ color: 'var(--text-main)' }}>Ajo & Esusu Savings Tracker</strong> &bull; Calabar, Cross River State Edition
          </div>
          <div>
            Built with React ESM &bull; Modern Glassmorphism UI
          </div>
        </div>
      </footer>

      {/* Modals */}
      {isCreateModalOpen && (
        <CreateGroupModal 
          onClose={() => setIsCreateModalOpen(false)}
          onCreateGroup={handleCreateGroup}
        />
      )}

      {logPaymentGroup && (
        <LogPaymentModal 
          group={logPaymentGroup}
          onClose={() => setLogPaymentGroup(null)}
          onSubmitPayment={handleSubmitPayment}
        />
      )}

      {receiptData && (
        <ReceiptModal 
          receiptData={receiptData}
          onClose={() => setReceiptData(null)}
        />
      )}

      {swapGroup && (
        <SwapPositionModal 
          group={swapGroup}
          onClose={() => setSwapGroup(null)}
          onSwapSubmit={handleSwapSubmit}
        />
      )}

      {/* Toast Alert */}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
