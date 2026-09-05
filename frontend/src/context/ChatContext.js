import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import useMixerStore from '../store/useMixerStore';

const ChatContext = createContext();
export const useChat = () => useContext(ChatContext);

// =========================================================
// SESSION CONTEXT SUMMARY GENERATOR
// =========================================================
const getCompactSessionSummary = () => {
  const state = useMixerStore.getState();
  const stems = state.activeStemConfig;
  if (!stems || !Array.isArray(stems) || stems.length === 0) return null;

  const currentGains = state.currentGains || {};
  const fxSettings = state.fxSettings || {};
  const dangerTracks = [];

  const tracksSummary = stems.map((stem) => {
    const currentDB = currentGains[stem.id] ?? stem.initialDB ?? 0;
    const initialDB = stem.initialDB ?? 0;
    const safeRange = stem.safeRange ?? 4.0;
    const deviation = Math.abs(currentDB - initialDB);
    const isDanger = !state.bypass && deviation > safeRange;
    if (isDanger) dangerTracks.push(stem.displayName);

    const fx = fxSettings[stem.id] || {};
    const eqStr = fx.eq ? `EQ[Low:${fx.eq.low ?? 0}dB, Mid:${fx.eq.mid ?? 0}dB, High:${fx.eq.high ?? 0}dB]` : '';
    const compStr = fx.comp ? `COMP[thresh:${fx.comp.thresh ?? -16}dB, ratio:${fx.comp.ratio ?? 3}:1, makeup:${fx.comp.makeup ?? 0}dB]` : '';
    const satStr = fx.sat ? `SAT:${fx.sat}%` : '';
    const sendsStr = fx.sends ? `SENDS[rev:${Math.round((fx.sends.reverb ?? 0) * 100)}%, dly:${Math.round((fx.sends.delay ?? 0) * 100)}%]` : '';

    return {
      name: stem.displayName,
      role: stem.role || 'other',
      bus: stem.bus || 'Unclassified',
      currentDB: Math.round(currentDB * 10) / 10,
      initialDB: Math.round(initialDB * 10) / 10,
      safeRangeDB: safeRange,
      inDangerZone: isDanger,
      fx: [eqStr, compStr, satStr, sendsStr].filter(Boolean).join(' '),
      reasoning: stem.reasoning || '',
    };
  });

  return {
    totalTracks: stems.length,
    dangerCount: dangerTracks.length,
    dangerTracks,
    tracks: tracksSummary,
  };
};

export const ChatProvider = ({ children }) => {
  // 1. SESSION MANAGEMENT
  const [sessions, setSessions] = useState(() => {
    const saved = localStorage.getItem('sono_sessions');
    return saved ? JSON.parse(saved) : [{ id: 1, name: 'New Session', date: 'Just now', messages: [] }];
  });

  const [activeSessionId, setActiveSessionId] = useState(() => {
    const savedId = localStorage.getItem('sono_active_id');
    return savedId ? parseInt(savedId) : 1;
  });

  const [isLoading, setIsLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const activeSession = sessions.find(s => s.id === activeSessionId) || sessions[0];
  const messages = activeSession ? activeSession.messages : [];

  // 2. LUNA'S RPG STATS
  const [rpgStats, setRpgStats] = useState(() => {
    const savedStats = localStorage.getItem('luna_rpg_stats');
    return savedStats ? JSON.parse(savedStats) : {
      friendship: 15,
      mixingLevel: 5,
      mood: 'Neutral',
      messagesSent: 0
    };
  });

  // 3. PRODUCER CAREER STATS
  const [producerStats, setProducerStats] = useState(() => {
    const saved = localStorage.getItem('sono_producer_stats');
    return saved ? JSON.parse(saved) : {
      level: 1, currentXP: 0, nextLevelXP: 100,
      title: 'Bedroom Producer', currency: 0, streak: 1
    };
  });

  const [quests, setQuests] = useState(() => {
    const saved = localStorage.getItem('sono_quests');
    return saved ? JSON.parse(saved) : [
      { id: 1, label: 'Upload a new Track', type: 'upload', reward: 50, completed: false },
      { id: 2, label: 'Ask Luna for Advice', type: 'chat', reward: 20, completed: false },
      { id: 3, label: 'Export a Mix', type: 'export', reward: 100, completed: false },
    ];
  });

  // 4. PERSISTENCE
  useEffect(() => {
    localStorage.setItem('sono_sessions', JSON.stringify(sessions));
    localStorage.setItem('sono_active_id', activeSessionId.toString());
    localStorage.setItem('luna_rpg_stats', JSON.stringify(rpgStats));
    localStorage.setItem('sono_producer_stats', JSON.stringify(producerStats));
    localStorage.setItem('sono_quests', JSON.stringify(quests));
  }, [sessions, activeSessionId, rpgStats, producerStats, quests]);

  // 5. RPG LOGIC
  const updateRPGStats = (actionType) => {
    setRpgStats(prev => {
      let newFriendship = prev.friendship;
      let newMixing = prev.mixingLevel;
      let newCount = prev.messagesSent + 1;

      if (actionType === 'chat') newFriendship = Math.min(100, prev.friendship + 0.5);
      if (actionType === 'upload') {
        newMixing = Math.min(100, prev.mixingLevel + 5);
        newFriendship = Math.min(100, prev.friendship + 2);
      }

      const hour = new Date().getHours();
      let currentMood = 'Vibing 🌊';
      if (hour >= 6 && hour < 12) currentMood = 'Caffeinated ☕';
      else if (hour >= 12 && hour < 18) currentMood = 'Locked In 🧠';
      else if (hour >= 18 && hour < 22) currentMood = 'Creative 🎨';
      else currentMood = 'Sleepy 🌙';

      return { ...prev, friendship: newFriendship, mixingLevel: newMixing, mood: currentMood, messagesSent: newCount };
    });
  };

  const addXP = (amount) => {
    setProducerStats(prev => {
      let newXP = prev.currentXP + amount;
      let newLevel = prev.level;
      let newNext = prev.nextLevelXP;
      let newTitle = prev.title;
      if (newXP >= newNext) {
        newLevel += 1;
        newXP = newXP - newNext;
        newNext = Math.floor(newNext * 1.5);
        if (newLevel === 5) newTitle = 'Local Legend';
        if (newLevel === 10) newTitle = 'Chart Topper';
        if (newLevel === 20) newTitle = 'Audio God';
      }
      return { ...prev, level: newLevel, currentXP: newXP, nextLevelXP: newNext, title: newTitle, currency: prev.currency + (amount / 2) };
    });
  };

  const completeQuest = (type) => {
    setQuests(prev => {
      const targetQuest = prev.find(q => q.type === type && !q.completed);
      if (targetQuest) {
        addXP(targetQuest.reward);
        return prev.map(q => q.id === targetQuest.id ? { ...q, completed: true } : q);
      }
      return prev;
    });
  };

  // 6. SESSION ACTIONS
  const createNewSession = () => {
    if (messages.length === 0) return;
    const newId = Date.now();
    const newSession = { id: newId, name: 'New Session', date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), messages: [] };
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newId);
  };

  const switchSession = (id) => {
    if (messages.length === 0 && sessions.length > 1) {
      setSessions(prev => prev.filter(s => s.id !== activeSessionId));
    }
    setActiveSessionId(id);
  };

  const deleteSession = (e, idToDelete) => {
    e.stopPropagation();
    const updatedSessions = sessions.filter(s => s.id !== idToDelete);
    if (updatedSessions.length === 0) {
      const newId = Date.now();
      setSessions([{ id: newId, name: 'New Session', date: 'Just now', messages: [] }]);
      setActiveSessionId(newId);
    } else {
      setSessions(updatedSessions);
      if (idToDelete === activeSessionId) setActiveSessionId(updatedSessions[0].id);
    }
  };

  const clearChat = () => {
    setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, messages: [] } : s));
  };

  const clearMessages = () => clearChat();
  const clearUnread = () => setUnreadCount(0);

  // =========================================================
  // 7. SEND MESSAGE — Calls Backend Flask Server-Side Endpoint (POST /chat)
  // =========================================================
  const sendMessage = async (userText) => {
    if (!userText.trim()) return;

    updateRPGStats('chat');
    completeQuest('chat');

    const newUserMsg = { role: 'user', content: userText };
    const updatedMsgs = [...messages, newUserMsg];

    setSessions(prev => prev.map(s => {
      if (s.id === activeSessionId) {
        const isFirst = s.messages.length === 0;
        return {
          ...s,
          messages: updatedMsgs,
          name: isFirst ? (userText.substring(0, 18) + (userText.length > 18 ? "..." : "")) : s.name
        };
      }
      return s;
    }));

    setIsLoading(true);

    try {
      // Build session context from live store
      const sessionContext = getCompactSessionSummary();

      const host = window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname;
      const response = await fetch(`http://${host}:5000/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userText,
          history: updatedMsgs.filter((m) => !m.isSystem),
          session_context: sessionContext,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || errJson.response || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const lunaReply = data.response || "Hmm, I got nothing back... try asking again? 🤔";

      const newLunaMsg = { role: 'assistant', content: lunaReply };
      setSessions(prev => prev.map(s =>
        s.id === activeSessionId ? { ...s, messages: [...updatedMsgs, newLunaMsg] } : s
      ));
      setUnreadCount(prev => prev + 1);

    } catch (error) {
      console.error('Luna Error:', error);
      const errorMsg = `😵‍💫 ${error.message || 'Server connection failed. Is Flask running on port 5000?'}`;

      setSessions(prev => prev.map(s =>
        s.id === activeSessionId ? { ...s, messages: [...updatedMsgs, { role: 'assistant', content: errorMsg }] } : s
      ));
    } finally {
      setIsLoading(false);
    }
  };

  // 8. SYSTEM MESSAGES (For mix analysis notifications)
  const addSystemMessage = (text, triggerNotification = false) => {
    const sysMsg = { role: 'assistant', content: text, isSystem: true };
    setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, messages: [...s.messages, sysMsg] } : s));
    if (triggerNotification) {
      window.dispatchEvent(new CustomEvent('luna-notification', { detail: text }));
    }
  };

  // =========================================================
  // 9. PROVIDER RETURN
  // =========================================================
  return (
    <ChatContext.Provider value={{
      messages, sendMessage, isLoading, addSystemMessage, unreadCount, clearUnread, clearChat, clearMessages,
      sessions, activeSessionId, createNewSession, switchSession, deleteSession,
      rpgStats,
      producerStats, quests, completeQuest, addXP
    }}>
      {children}
    </ChatContext.Provider>
  );
};