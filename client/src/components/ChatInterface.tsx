/**
 * ChatInterface - Phase 3 Enhancement
 * 
 * Interactive chat interface for the AI co-pilot with message history,
 * typing indicators, and seamless integration with FPL analysis.
 */

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { 
  type ChatMessage, 
  type AICopilotResponse, 
  type AIInsight 
} from '@shared/schema';
import { AIInsights } from '@/components/AIInsights';
import { useToast } from '@/hooks/use-toast';

interface ChatInterfaceProps {
  teamId?: string;
  onAnalysisRequest?: (teamId: string) => void;
  className?: string;
}

export function ChatInterface({ teamId, onAnalysisRequest, className }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [sessionId, setSessionId] = useState<string>('');
  const [isInitialized, setIsInitialized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize chat with welcome message
  useEffect(() => {
    if (!isInitialized) {
      const welcomeMessage: ChatMessage = {
        id: 'welcome_msg',
        role: 'assistant',
        content: "Hi! I'm your AI FPL co-pilot. I can help you analyze your squad, plan chip strategy, suggest transfers, and answer any FPL questions. What would you like to know?",
        timestamp: new Date().toISOString(),
        metadata: {
          queryType: 'general',
          confidence: 100
        }
      };
      setMessages([welcomeMessage]);
      setIsInitialized(true);
    }
  }, [isInitialized]);

  // Chat mutation for sending messages
  const chatMutation = useMutation({
    mutationFn: async (message: string): Promise<AICopilotResponse & { sessionId: string }> => {
      const response = await apiRequest('POST', '/api/chat', {
        message,
        sessionId: sessionId || undefined,
        teamId,
        userId: undefined // Could be added for user tracking
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Chat request failed');
      }
      return result.data;
    },
    onSuccess: (response) => {
      // Update session ID if new
      if (response.sessionId && !sessionId) {
        setSessionId(response.sessionId);
      }

      // Add assistant response to messages
      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now()}_assistant`,
        role: 'assistant',
        content: response.message,
        timestamp: new Date().toISOString(),
        metadata: {
          queryType: response.conversationContext.intent.type as any,
          confidence: response.conversationContext.intent.confidence,
          processingTime: response.conversationContext.responseTime
        }
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Trigger analysis request if the AI detected a team ID
      if (response.conversationContext.intent.entities.players && onAnalysisRequest && teamId) {
        setTimeout(() => onAnalysisRequest(teamId), 1000); // Delayed to let user see the response
      }
    },
    onError: (error) => {
      console.error('Chat error:', error);
      toast({
        title: "Chat Error",
        description: "Sorry, I couldn't process your message. Please try again.",
        variant: "destructive",
      });

      // Add error message
      const errorMessage: ChatMessage = {
        id: `msg_${Date.now()}_error`,
        role: 'assistant',
        content: "I apologize, but I'm having trouble processing your request right now. Could you try rephrasing your question?",
        timestamp: new Date().toISOString(),
        metadata: {
          queryType: 'general',
          confidence: 0
        }
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  });

  const sendMessage = async () => {
    if (!currentMessage.trim() || chatMutation.isPending) return;

    const messageText = currentMessage.trim();
    setCurrentMessage('');

    // Add user message immediately
    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}_user`,
      role: 'user',
      content: messageText,
      timestamp: new Date().toISOString(),
      metadata: {
        queryType: 'general'
      }
    };
    setMessages(prev => [...prev, userMessage]);

    // Send to AI
    chatMutation.mutate(messageText);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatMessageTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getLatestResponse = (): AICopilotResponse | null => {
    const lastAssistantMessage = messages
      .filter(m => m.role === 'assistant')
      .pop();
    
    if (!lastAssistantMessage || !chatMutation.data) return null;
    
    return chatMutation.data;
  };

  const latestResponse = getLatestResponse();

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <Card className="flex-1 flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            AI FPL Co-pilot
            {teamId && (
              <Badge variant="secondary" className="ml-auto">
                Team {teamId}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        
        <CardContent className="flex-1 flex flex-col min-h-0">
          {/* Messages Area */}
          <ScrollArea className="flex-1 mb-4 pr-4">
            <div className="space-y-4" data-testid="chat-messages">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                  data-testid={`message-${message.role}-${message.id}`}
                >
                  {message.role === 'assistant' && (
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                    </div>
                  )}
                  
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs opacity-70">
                        {formatMessageTime(message.timestamp)}
                      </span>
                      {message.metadata?.confidence && message.role === 'assistant' && (
                        <Badge 
                          variant="outline" 
                          className="text-xs py-0 px-1"
                          data-testid={`confidence-${message.id}`}
                        >
                          {message.metadata.confidence}% confidence
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  {message.role === 'user' && (
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                        <User className="h-4 w-4 text-secondary-foreground" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
              
              {/* Typing indicator */}
              {chatMutation.isPending && (
                <div className="flex gap-3 justify-start">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Loader2 className="h-4 w-4 text-primary animate-spin" />
                    </div>
                  </div>
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <p className="text-sm text-muted-foreground">
                      AI is analyzing...
                    </p>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* AI Insights Panel */}
          {latestResponse && latestResponse.insights.length > 0 && (
            <>
              <Separator className="mb-4" />
              <div className="mb-4">
                <AIInsights 
                  insights={latestResponse.insights}
                  suggestions={latestResponse.suggestions}
                  followUpQuestions={latestResponse.followUpQuestions}
                  onQuestionClick={(question: string) => {
                    setCurrentMessage(question);
                    setTimeout(() => sendMessage(), 100);
                  }}
                />
              </div>
            </>
          )}

          {/* Input Area */}
          <div className="flex gap-2" data-testid="chat-input-area">
            <Input
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask me about your FPL strategy..."
              disabled={chatMutation.isPending}
              className="flex-1"
              data-testid="input-chat-message"
            />
            <Button
              onClick={sendMessage}
              disabled={!currentMessage.trim() || chatMutation.isPending}
              size="icon"
              data-testid="button-send-message"
            >
              {chatMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Quick Actions */}
          {messages.length <= 1 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {[
                "Analyze my squad",
                "When should I use my wildcard?",
                "Who should I transfer in?",
                "Compare Salah vs Son"
              ].map((quickAction) => (
                <Button
                  key={quickAction}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCurrentMessage(quickAction);
                    setTimeout(() => sendMessage(), 100);
                  }}
                  className="text-xs"
                  data-testid={`button-quick-action-${quickAction.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {quickAction}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}