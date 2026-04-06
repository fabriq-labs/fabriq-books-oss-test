import React, { useState, useRef, useEffect } from 'react';
import { Send, Download, FileImage, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { processInsightQuery } from '@/services/insightsService';
import { BarChart, LineChart, PieChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Bar, Line, Cell, Pie, Legend } from 'recharts';
import { toast } from "sonner";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
  loading?: boolean;
  chartType?: 'bar' | 'line' | 'pie' | null;
  chartData?: any;
}

export const InsightsConversation: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: 'Hello! I can help you with procurement insights. Try asking something like "Who are our top suppliers?" or "Show me purchase trends from last quarter."',
      sender: 'assistant',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chartRefs = useRef<{[key: string]: React.RefObject<HTMLDivElement>}>({});

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    messages.forEach(message => {
      if (message.chartType && !chartRefs.current[message.id]) {
        chartRefs.current[message.id] = React.createRef<HTMLDivElement>();
      }
    });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim()) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      content: input,
      sender: 'user',
      timestamp: new Date(),
    };
    
    const loadingMessage: Message = {
      id: (Date.now() + 1).toString(),
      content: '',
      sender: 'assistant',
      timestamp: new Date(),
      loading: true,
    };
    
    setMessages(prev => [...prev, userMessage, loadingMessage]);
    setInput('');
    setIsProcessing(true);

    try {
      const response = await processInsightQuery(input);
      
      setMessages(prev => prev.map(msg => 
        msg.id === loadingMessage.id ? {
          ...msg,
          content: response.message,
          loading: false,
          chartType: response.chartType,
          chartData: response.chartData
        } : msg
      ));
    } catch (error) {
      console.error("Error processing insight query:", error);
      
      setMessages(prev => prev.map(msg => 
        msg.id === loadingMessage.id ? {
          ...msg,
          content: "I'm sorry, I encountered an error processing your request. Please try again.",
          loading: false
        } : msg
      ));
    }
    
    setIsProcessing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const downloadAsImage = async (messageId: string) => {
    const chartElement = chartRefs.current[messageId]?.current;
    if (!chartElement) return;
    
    try {
      const canvas = await html2canvas(chartElement);
      const imageData = canvas.toDataURL('image/png');
      
      const link = document.createElement('a');
      link.href = imageData;
      link.download = `insight-chart-${messageId}.png`;
      link.click();
      
      toast("Chart downloaded as image");
    } catch (error) {
      console.error("Error downloading chart as image:", error);
      toast("Failed to download image");
    }
  };

  const downloadAsPDF = async (messageId: string, content: string) => {
    const chartElement = chartRefs.current[messageId]?.current;
    if (!chartElement) return;
    
    try {
      const canvas = await html2canvas(chartElement);
      const imageData = canvas.toDataURL('image/png');
      
      const pdf = new jsPDF('landscape');
      
      pdf.setFontSize(16);
      pdf.text("Procurement Insight", 14, 15);
      
      pdf.setFontSize(10);
      pdf.text(`Generated: ${new Date().toLocaleString()}`, 14, 22);
      
      pdf.setFontSize(12);
      const splitText = pdf.splitTextToSize(content, 250);
      pdf.text(splitText, 14, 30);
      
      const imgHeight = canvas.height * 180 / canvas.width;
      pdf.addImage(imageData, 'PNG', 14, 30 + splitText.length * 5, 180, imgHeight);
      
      pdf.save(`insight-report-${messageId}.pdf`);
      
      toast("Report downloaded as PDF");
    } catch (error) {
      console.error("Error downloading chart as PDF:", error);
      toast("Failed to download PDF");
    }
  };

  const exampleQueries = [
    "Who are our top 3 suppliers based on purchase volume?",
    "Show me monthly purchase trends for Q1",
    "What departments have the highest spending this year?",
    "Compare procurement cycle times across departments"
  ];

  const COLORS = ['#7028a0', '#9370DB', '#B19CD9', '#D8BFD8', '#E6E6FA'];

  const renderChart = (type: string, data: any, messageId: string) => {
    switch (type) {
      case 'bar':
        return (
          <div ref={chartRefs.current[messageId]} className="h-64 w-full mt-3 bg-white p-4 rounded-md">
            <ChartContainer 
              className="h-full text-sm" 
              config={{
                primary: { theme: { light: '#7028a0', dark: '#9370DB' } },
                secondary: { theme: { light: '#9370DB', dark: '#B19CD9' } },
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.labels.map((label: string, i: number) => ({ name: label, value: data.values[i] }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip content={<ChartTooltipContent />} />
                  <Legend />
                  <Bar dataKey="value" fill="#7028a0" />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        );
      case 'line':
        return (
          <div ref={chartRefs.current[messageId]} className="h-64 w-full mt-3 bg-white p-4 rounded-md">
            <ChartContainer 
              className="h-full text-sm" 
              config={{
                primary: { theme: { light: '#7028a0', dark: '#9370DB' } },
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.labels.map((label: string, i: number) => ({ name: label, value: data.values[i] }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip content={<ChartTooltipContent />} />
                  <Legend />
                  <Line type="monotone" dataKey="value" stroke="#7028a0" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        );
      case 'pie':
        return (
          <div ref={chartRefs.current[messageId]} className="h-64 w-full mt-3 bg-white p-4 rounded-md">
            <ChartContainer 
              className="h-full text-sm" 
              config={{
                primary: { theme: { light: '#7028a0', dark: '#9370DB' } },
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.labels.map((label: string, i: number) => ({ name: label, value: data.values[i] }))}
                    cx="50%"
                    cy="50%"
                    labelLine={true}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  >
                    {data.labels.map((_: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`flex items-start gap-2 max-w-3xl ${message.sender === 'user' ? 'flex-row-reverse' : ''}`}>
              <Avatar className={`${message.sender === 'user' ? 'bg-primary' : 'bg-gray-200'}`}>
                {message.sender === 'user' ? (
                  <span className="text-white">U</span>
                ) : (
                  <LineChart className="h-4 w-4 text-gray-700" />
                )}
              </Avatar>
              
              <Card className={`p-3 ${message.sender === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                {message.loading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-[250px]" />
                    <Skeleton className="h-4 w-[200px]" />
                    <Skeleton className="h-4 w-[150px]" />
                  </div>
                ) : (
                  <div>
                    <div className="text-sm whitespace-pre-line">{message.content}</div>
                    
                    {message.chartType && message.chartData && renderChart(message.chartType, message.chartData, message.id)}
                    
                    {message.chartType && message.chartData && (
                      <div className="mt-2 flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex items-center gap-1"
                          onClick={() => downloadAsImage(message.id)}
                        >
                          <FileImage className="h-3 w-3" />
                          <span className="text-xs">Download Image</span>
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex items-center gap-1"
                          onClick={() => downloadAsPDF(message.id, message.content)}
                        >
                          <FileText className="h-3 w-3" />
                          <span className="text-xs">Download PDF</span>
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {messages.length <= 2 && (
        <div className="px-4 pb-2">
          <p className="text-sm text-gray-500 mb-2">Try asking:</p>
          <div className="flex flex-wrap gap-2">
            {exampleQueries.map((query, index) => (
              <Button 
                key={index} 
                variant="outline" 
                className="text-xs"
                onClick={() => {
                  setInput(query);
                  inputRef.current?.focus();
                }}
              >
                {query}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            placeholder="Ask a question about procurement data..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isProcessing}
            className="flex-1"
          />
          <Button 
            onClick={handleSendMessage} 
            disabled={!input.trim() || isProcessing}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
