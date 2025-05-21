import { Agent } from '../../agent/types.js';
import { Provider } from '../../provider/types.js';

/**
 * Interface for conversation data
 */
export interface Conversation {
  id: string;
  agent: Agent;
  provider: Provider;
  createdAt: Date;
  lastActivity: Date;
  isActive: boolean;
}

/**
 * Type definition for the ConversationService
 */
export type ConversationService = {
  addConversation: (id: string, agent: Agent, provider: Provider) => void;
  getConversation: (id: string) => Conversation | undefined;
  updateActivity: (id: string) => boolean;
  deactivateConversation: (id: string) => boolean;
  cleanupInactiveConversations: (maxAgeMs: number) => void;
  getAllConversations: () => Conversation[];
  getActiveConversationsCount: () => number;
};

/**
 * Service for managing conversations and associated agents
 */
export const createConversationService = (): ConversationService => {
  // Map of conversation ID to conversation data
  const conversations: Map<string, Conversation> = new Map();

  /**
   * Adds a new conversation with the associated agent
   */
  const addConversation = (id: string, agent: Agent, provider: Provider): void => {
    const now = new Date();
    conversations.set(id, {
      id,
      agent,
      provider,
      createdAt: now,
      lastActivity: now,
      isActive: true,
    });
  };

  /**
   * Gets a conversation by its ID
   */
  const getConversation = (id: string): Conversation | undefined => {
    return conversations.get(id);
  };

  /**
   * Updates the last activity timestamp for a conversation
   * @returns {boolean} True if the conversation was found and updated, false otherwise
   */
  const updateActivity = (id: string): boolean => {
    const conversation = conversations.get(id);
    if (!conversation) return false;

    conversation.lastActivity = new Date();
    return true;
  };

  /**
   * Deactivates a conversation
   * @returns {boolean} True if the conversation was found and deactivated, false otherwise
   */
  const deactivateConversation = (id: string): boolean => {
    const conversation = conversations.get(id);
    if (!conversation) return false;

    conversation.isActive = false;
    return true;
  };

  /**
   * Removes conversations that have been inactive for longer than maxAgeMs
   */
  const cleanupInactiveConversations = (maxAgeMs: number): void => {
    const now = new Date();
    for (const [id, conversation] of conversations.entries()) {
      const age = now.getTime() - conversation.lastActivity.getTime();
      if (age > maxAgeMs || !conversation.isActive) {
        conversations.delete(id);
      }
    }
  };

  /**
   * Gets all conversations
   */
  const getAllConversations = (): Conversation[] => {
    return Array.from(conversations.values());
  };

  /**
   * Gets the count of active conversations
   */
  const getActiveConversationsCount = (): number => {
    return Array.from(conversations.values()).filter((c) => c.isActive).length;
  };

  return {
    addConversation,
    getConversation,
    updateActivity,
    deactivateConversation,
    cleanupInactiveConversations,
    getAllConversations,
    getActiveConversationsCount,
  };
};
