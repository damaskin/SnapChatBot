import { initializeApp, FirebaseApp } from 'firebase/app';
import { 
  getFirestore, 
  Firestore, 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  getDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp
} from 'firebase/firestore';
import { 
  getAuth, 
  Auth, 
  signInAnonymously, 
  User 
} from 'firebase/auth';
import { FirebaseConfig, ChatSession, AIAgent, Statistics, DailyStats } from '../types';

class FirebaseService {
  private app: FirebaseApp | null = null;
  private db: Firestore | null = null;
  private auth: Auth | null = null;
  private user: User | null = null;

  async initialize(config: FirebaseConfig): Promise<void> {
    try {
      // Проверяем, что конфигурация полная
      if (!config.apiKey || !config.authDomain || !config.projectId) {
        throw new Error('Неполная конфигурация Firebase. Проверьте все поля.');
      }

      this.app = initializeApp(config);
      this.db = getFirestore(this.app);
      this.auth = getAuth(this.app);
      
      console.log('Firebase initialized successfully with project:', config.projectId);
      console.log('Firebase ready for use (Chrome extension mode)');
    } catch (error) {
      console.error('Firebase initialization failed:', error);
      throw error;
    }
  }

  // Chat Sessions
  async saveChatSession(session: ChatSession): Promise<void> {
    if (!this.db) throw new Error('Firebase not initialized');
    
    const sessionRef = doc(this.db, 'chatSessions', session.id);
    await updateDoc(sessionRef, {
      ...session,
      lastActivity: Timestamp.fromMillis(session.lastActivity)
    });
  }

  async getChatSession(sessionId: string): Promise<ChatSession | null> {
    if (!this.db) throw new Error('Firebase not initialized');
    
    const sessionRef = doc(this.db, 'chatSessions', sessionId);
    const sessionSnap = await getDoc(sessionRef);
    
    if (sessionSnap.exists()) {
      const data = sessionSnap.data();
      return {
        ...data,
        lastActivity: data.lastActivity.toMillis()
      } as ChatSession;
    }
    return null;
  }

  async getActiveChatSessions(): Promise<ChatSession[]> {
    if (!this.db) throw new Error('Firebase not initialized');
    
    const sessionsRef = collection(this.db, 'chatSessions');
    const q = query(sessionsRef, where('isActive', '==', true));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        lastActivity: data.lastActivity.toMillis()
      } as ChatSession;
    });
  }

  // AI Agents
  async saveAIAgent(agent: AIAgent): Promise<string> {
    if (!this.db) throw new Error('Firebase not initialized');
    
    const agentsRef = collection(this.db, 'aiAgents');
    const docRef = await addDoc(agentsRef, {
      ...agent,
      createdAt: Timestamp.fromMillis(agent.createdAt),
      updatedAt: Timestamp.fromMillis(agent.updatedAt)
    });
    return docRef.id;
  }

  async getAIAgents(): Promise<AIAgent[]> {
    if (!this.db) throw new Error('Firebase not initialized');
    
    const agentsRef = collection(this.db, 'aiAgents');
    const q = query(agentsRef, orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt.toMillis(),
        updatedAt: data.updatedAt.toMillis()
      } as AIAgent;
    });
  }

  async updateAIAgent(agentId: string, updates: Partial<AIAgent>): Promise<void> {
    if (!this.db) throw new Error('Firebase not initialized');
    
    const agentRef = doc(this.db, 'aiAgents', agentId);
    const updateData = {
      ...updates,
      updatedAt: Timestamp.fromMillis(Date.now())
    };
    await updateDoc(agentRef, updateData);
  }

  // Statistics
  async saveStatistics(stats: Statistics): Promise<void> {
    if (!this.db) throw new Error('Firebase not initialized');
    
    const statsRef = doc(this.db, 'statistics', 'main');
    await updateDoc(statsRef, {
      ...stats,
      dailyStats: stats.dailyStats.map(day => ({
        ...day,
        date: Timestamp.fromDate(new Date(day.date))
      }))
    });
  }

  async getStatistics(): Promise<Statistics | null> {
    if (!this.db) {
      console.log('Firebase not initialized, returning default statistics');
      return {
        totalMessages: 0,
        totalReplies: 0,
        activeChats: 0,
        averageResponseTime: 0,
        successRate: 0,
        dailyStats: []
      };
    }
    
    try {
      // Пробуем получить статистику из Firestore
      const statsRef = doc(this.db, 'statistics', 'main');
      const statsSnap = await getDoc(statsRef);
      
      if (statsSnap.exists()) {
        const data = statsSnap.data();
        return {
          ...data,
          dailyStats: data.dailyStats?.map((day: any) => ({
            ...day,
            date: day.date?.toDate?.()?.toISOString?.()?.split('T')[0] || day.date
          })) || []
        } as Statistics;
      }
      
      // Возвращаем дефолтную статистику если нет данных
      return {
        totalMessages: 0,
        totalReplies: 0,
        activeChats: 0,
        averageResponseTime: 0,
        successRate: 0,
        dailyStats: []
      };
    } catch (error) {
      console.error('Error getting statistics from Firebase:', error);
      console.log('Firebase permissions issue, returning default statistics');
      
      // Возвращаем дефолтную статистику при ошибке прав доступа
      return {
        totalMessages: 0,
        totalReplies: 0,
        activeChats: 0,
        averageResponseTime: 0,
        successRate: 0,
        dailyStats: []
      };
    }
  }

  // Real-time listeners
  onChatSessionsChange(callback: (sessions: ChatSession[]) => void): () => void {
    if (!this.db) throw new Error('Firebase not initialized');
    
    const sessionsRef = collection(this.db, 'chatSessions');
    const q = query(sessionsRef, where('isActive', '==', true));
    
    return onSnapshot(q, (querySnapshot) => {
      const sessions = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          lastActivity: data.lastActivity.toMillis()
        } as ChatSession;
      });
      callback(sessions);
    });
  }
}

export const firebaseService = new FirebaseService();
