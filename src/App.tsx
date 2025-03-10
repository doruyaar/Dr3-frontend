/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useRef, useEffect } from 'react';
import { Star, Send, Loader2, User, Copy, Mic, Check, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

interface ConversationMessage {
  role?: 'user' | 'assistant';
  content: string;
  id?: string;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const retryTimeoutRef = useRef<any>(null);
  const silenceTimeoutRef = useRef<any>(null);
  const lastSoundTimestampRef = useRef<number>(Date.now());

  useEffect(() => {
    localStorage.removeItem('conversation');
  }, []);

  useEffect(() => {
    localStorage.setItem('conversation', JSON.stringify(messages));
  }, [messages]);

  const resetConversation = () => {
    setMessages([]);
    localStorage.removeItem('conversation');
    setInput('');
    if (isRecording) {
      stopRecording();
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const initializeSpeechRecognition = () => {
    if ('webkitSpeechRecognition' in window) {
      recognitionRef.current = new (window as any).webkitSpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';
      
      recognitionRef.current.onstart = () => {
        setIsRecording(true);
        console.log('Speech recognition started');
        lastSoundTimestampRef.current = Date.now();
        startSilenceDetection();
      };
      
      recognitionRef.current.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join(' ');
        setInput(transcript);
        lastSoundTimestampRef.current = Date.now();
      };

      recognitionRef.current.onaudiostart = () => {
        lastSoundTimestampRef.current = Date.now();
      };

      recognitionRef.current.onaudioend = () => {
        const silenceDuration = Date.now() - lastSoundTimestampRef.current;
        if (silenceDuration >= 3000) {
          stopRecording();
        }
      };
      
      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        
        if (event.error === 'network') {
          if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
          }
          
          retryTimeoutRef.current = setTimeout(() => {
            if (isRecording) {
              console.log('Attempting to restart speech recognition...');
              try {
                recognitionRef.current.stop();
                recognitionRef.current.start();
              } catch (e) {
                console.error('Failed to restart speech recognition:', e);
                stopRecording();
              }
            }
          }, 1000);
        } else {
          stopRecording();
        }
      };
      
      recognitionRef.current.onend = () => {
        if (!retryTimeoutRef.current) {
          console.log('Speech recognition ended');
          stopRecording();
        }
      };
    }
  };

  const startSilenceDetection = () => {
    if (silenceTimeoutRef.current) {
      clearInterval(silenceTimeoutRef.current);
    }

    silenceTimeoutRef.current = setInterval(() => {
      const silenceDuration = Date.now() - lastSoundTimestampRef.current;
      if (silenceDuration >= 3000 && isRecording) {
        stopRecording();
      }
    }, 500);
  };

  const stopRecording = () => {
    if (silenceTimeoutRef.current) {
      clearInterval(silenceTimeoutRef.current);
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    try {
      recognitionRef.current?.stop();
    } catch (e) {
      console.error('Error stopping recognition:', e);
    }
    setIsRecording(false);
  };

  useEffect(() => {
    initializeSpeechRecognition();

    return () => {
      stopRecording();
    };
  }, []);

  const handleCopy = async (content: string, messageId: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(messageId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in your browser.');
      return;
    }

    if (isRecording) {
      stopRecording();
    } else {
      setInput('');
      try {
        recognitionRef.current.start();
      } catch (error) {
        console.error('Failed to start speech recognition:', error);
        initializeSpeechRecognition();
        try {
          recognitionRef.current.start();
        } catch (retryError) {
          console.error('Failed to start speech recognition after retry:', retryError);
          setIsRecording(false);
          alert('Failed to start speech recognition. Please try again.');
        }
      }
    }
  };

  const formatConversationHistory = (messages: Message[]): ConversationMessage[] => {
    return messages.map(msg => ({
      ...(msg.sender === 'user' ? { role: "user", "content": msg.content } : { role: "assistant", content: msg.content, id: msg.id })
    }));
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    if (isRecording) {
      stopRecording();
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      content: input.trim(),
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const conversationHistory = formatConversationHistory([...messages, userMessage]);
      
      const response = await fetch('http://localhost:5000/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
          conversation: conversationHistory
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response from the server');
      }

      const data = await response.json();
      
      const aiMessage: Message = {
        id: data.id || Date.now().toString(),
        content: data.message || "I apologize, but I couldn't process your dream at the moment. Please try again.",
        sender: 'ai',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error getting AI response:', error);
      const errorMessage: Message = {
        id: Date.now().toString(),
        content: "I apologize, but I'm having trouble connecting to the server. Please try again later.",
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      hour12: true,
    }).format(date);
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-b from-indigo-900 via-purple-900 to-slate-900">
      <header className="flex items-center justify-between p-4 bg-black/20 backdrop-blur-sm">
        <div className="flex items-center space-x-2">
          <Star className="w-8 h-8 text-purple-300" />
          <h1 className="text-2xl font-bold text-white">Dr3.xyz</h1>
        </div>
        <button
          onClick={resetConversation}
          className="flex items-center space-x-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-purple-300 rounded-lg transition-colors"
          title="Start new conversation"
        >
          <RefreshCw className="w-5 h-5" />
          <span>New Chat</span>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 text-white/80">
            <Star className="w-16 h-16 text-purple-400" />
            <h2 className="text-2xl font-semibold">Welcome to Dr3.xyz</h2>
            <p className="max-w-md">Share your dreams, and I'll help you understand their deeper meaning and symbolism.</p>
          </div>
        )}
        
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex items-start space-x-2 ${message.sender === 'user' ? 'flex-row-reverse space-x-reverse' : 'flex-row'}`}
          >
            <div className={`flex-shrink-0 ${message.sender === 'user' ? 'bg-purple-600' : 'bg-white/10'} p-2 rounded-full`}>
              {message.sender === 'user' ? (
                <User className="w-5 h-5 text-white" />
              ) : (
                <Star className="w-5 h-5 text-purple-300" />
              )}
            </div>
            <div
              className={`max-w-[80%] md:max-w-[70%] rounded-2xl p-4 ${
                message.sender === 'user'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white/10 backdrop-blur-sm text-white'
              }`}
            >
              {message.sender === 'user' ? (
                <p className="text-sm md:text-base">{message.content}</p>
              ) : (
                <div className="prose prose-invert prose-sm md:prose-base max-w-none">
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
              )}
              <div className="flex items-center justify-between mt-2">
                <span className={`text-xs ${
                  message.sender === 'user' ? 'text-purple-200' : 'text-purple-300'
                }`}>
                  {formatTime(message.timestamp)}
                </span>
                {message.sender === 'ai' && (
                  <button
                    onClick={() => handleCopy(message.content, message.id)}
                    className="text-purple-300 hover:text-purple-200 transition-colors"
                    title="Copy response"
                  >
                    {copiedId === message.id ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex items-start space-x-2">
            <div className="flex-shrink-0 bg-white/10 p-2 rounded-full">
              <Star className="w-5 h-5 text-purple-300" />
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 flex items-center space-x-2">
              <Loader2 className="w-5 h-5 text-purple-300 animate-spin" />
              <span className="text-purple-300">Interpreting your dream...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="p-4 bg-black/20 backdrop-blur-sm border-t border-white/10"
      >
        <div className="max-w-4xl mx-auto flex space-x-4">
          <div className="flex-1 flex space-x-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe your dream..."
              disabled={isLoading}
              className="flex-1 bg-white/10 text-white placeholder-white/50 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none h-12 max-h-32 disabled:opacity-50 disabled:cursor-not-allowed"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />
            <button
              type="button"
              onClick={toggleRecording}
              disabled={isLoading}
              className={`p-3 rounded-xl transition-colors ${
                isRecording 
                  ? 'bg-red-500 text-white animate-pulse' 
                  : 'bg-white/10 text-purple-300 hover:bg-white/20'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title={isRecording ? 'Stop recording' : 'Start recording'}
            >
              <Mic className="w-6 h-6" />
            </button>
          </div>
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-purple-600 text-white p-3 rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-6 h-6" />
          </button>
        </div>
      </form>
    </div>
  );
}

export default App;