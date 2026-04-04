import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from 'antd';
import {
  Sparkles,
  ArrowRight,
  MessageSquare,
  FileUp,
  RefreshCw,
  AlertCircle,
  CreditCard,
  CheckCircle2,
  Clock,
  TrendingUp,
  Building2,
  Link2,
  ChevronRight,
  Lightbulb,
} from 'lucide-react';
import { useChat } from '@/contexts/ChatContext';

// Static data matching seed data from setup-indian-demo.ts
const RECONCILIATION_DATA = {
  unmatched: 4,
  unmatchedAmount: 180000, // ₹60k + ₹50k + ₹25k + ₹45k from post_demo_21-24
  matched: 5,
  total: 24,
};

const AR_DATA = {
  totalOverdue: 448000, // Sum of balance_amount for overdue invoices
  overdueCount: 7,
  dso: 32,
  topCustomer: {
    name: 'Infosys Ltd',
    overdueAmount: 128000, // INV-002 (35k) + INV-007 (45k) + INV-012 (48k)
    invoiceCount: 3,
  },
};

const AI_INSIGHTS = [
  {
    id: 1,
    icon: RefreshCw,
    text: '4 bank transactions can be auto-matched to invoices',
    action: 'Which transactions are unreconciled and what do they match?',
    type: 'reconciliation',
  },
  {
    id: 2,
    icon: AlertCircle,
    text: 'Customer Wipro has ₹95,000 overdue (45+ days)',
    action: 'Tell me about overdue invoices from Wipro',
    type: 'ar',
  },
  {
    id: 3,
    icon: TrendingUp,
    text: 'DSO improved by 2 days compared to last month',
    action: 'What is our current DSO and how is it trending?',
    type: 'analytics',
  },
  {
    id: 4,
    icon: CreditCard,
    text: '₹25,000 advance payment from Wipro is unapplied',
    action: 'Which payments are unapplied and what invoices can they be applied to?',
    type: 'ar',
  },
];

const QUICK_SUGGESTIONS = [
  "What's unreconciled?",
  "Who should I follow up with?",
  "What's our DSO?",
  "Show overdue invoices",
];

const QUICK_ACTIONS = [
  {
    icon: FileUp,
    title: 'Import Bank Statement',
    path: '/accounting/transactions',
    aiAssisted: true,
  },
  {
    icon: RefreshCw,
    title: 'Reconcile Transactions',
    path: '/accounting/transactions?filter=unreconciled',
    aiAssisted: true,
  },
  {
    icon: AlertCircle,
    title: 'View Overdue Invoices',
    path: '/sales/invoices',
    aiAssisted: false,
  },
  {
    icon: CreditCard,
    title: 'Record Payment',
    path: '/sales/payment-receipts',
    aiAssisted: false,
  },
];

const DATA_SOURCES = [
  {
    name: 'Zoho Books',
    status: 'connected',
    lastSync: '2 hours ago',
  },
  {
    name: 'Bank Statement',
    status: 'imported',
    details: '24 transactions',
  },
];

// Format currency in Indian format
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
};

const AIDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { toggleChat, setPageContext, isChatOpen, setMessagesAi } = useChat();

  // Set page context on mount
  useEffect(() => {
    setPageContext({
      modelName: 'dashboard',
      viewName: 'dashboard_view',
      modelDisplayName: 'Dashboard',
      currentPath: '/',
    });
    return () => setPageContext(null);
  }, [setPageContext]);

  // Open chat with pre-filled message
  const openChatWithMessage = (message: string) => {
    // Set context for the chat
    setPageContext({
      modelName: 'dashboard',
      viewName: 'dashboard_view',
      modelDisplayName: 'Dashboard',
      currentPath: '/',
      promptTypes: ['analytics', 'default'],
    });

    // Store the suggested message in sessionStorage for ChatUI to pick up
    if (message) {
      sessionStorage.setItem('prefillChatMessage', message);
    }

    // Open chat if not already open
    if (!isChatOpen) {
      toggleChat();
    } else {
      // If chat is already open, we need to trigger a re-check of sessionStorage
      // by dispatching a custom event
      window.dispatchEvent(new Event('prefillChatMessage'));
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="mb-2">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Your AI-powered financial operations overview
        </p>
      </div>

      {/* Row 1: AI Command Bar */}
      <Card className="border-2 border-primary-100 bg-gradient-to-r from-primary-50/50 to-white">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary-100">
              <Sparkles className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Ask AI Assistant</h2>
              <p className="text-sm text-gray-500">
                Ask questions about your finances in plain English
              </p>
            </div>
          </div>

          {/* Search-like input */}
          <div
            onClick={() => openChatWithMessage('')}
            className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-lg cursor-pointer hover:border-primary-300 hover:shadow-sm transition-all"
          >
            <MessageSquare className="h-5 w-5 text-gray-400" />
            <span className="text-gray-400 flex-1">
              Ask anything... e.g., "What's unreconciled?" or "Who should I chase for payment?"
            </span>
            <kbd className="hidden md:inline-flex px-2 py-1 text-xs font-mono bg-gray-100 text-gray-500 rounded">
              ⌘K
            </kbd>
          </div>

          {/* Quick suggestions */}
          <div className="flex flex-wrap gap-2 mt-4">
            {QUICK_SUGGESTIONS.map((suggestion, idx) => (
              <button
                key={idx}
                onClick={() => openChatWithMessage(suggestion)}
                className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-full hover:border-primary-300 hover:bg-primary-50 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Row 2: Reconciliation + AR Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Reconciliation Widget */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Reconciliation</CardTitle>
                <Badge
                  count={
                    <span className="flex items-center gap-1 text-xs">
                      <Sparkles className="h-3 w-3" /> AI
                    </span>
                  }
                  style={{ backgroundColor: '#7028a0' }}
                />
              </div>
            </div>
            <CardDescription>Bank transactions vs books</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Main stat */}
            <div className="mb-4">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-amber-600">
                  {RECONCILIATION_DATA.unmatched}
                </span>
                <span className="text-gray-600">transactions need matching</span>
              </div>
              <div className="text-lg text-gray-700 mt-1">
                {formatCurrency(RECONCILIATION_DATA.unmatchedAmount)} pending
              </div>
            </div>

            {/* Progress indicator */}
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>
                  <CheckCircle2 className="h-4 w-4 inline mr-1 text-green-500" />
                  {RECONCILIATION_DATA.matched} matched
                </span>
                <span>
                  <Clock className="h-4 w-4 inline mr-1 text-amber-500" />
                  {RECONCILIATION_DATA.unmatched} pending
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full"
                  style={{
                    width: `${(RECONCILIATION_DATA.matched / (RECONCILIATION_DATA.matched + RECONCILIATION_DATA.unmatched)) * 100}%`,
                  }}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => openChatWithMessage("Which transactions are unreconciled and what do they match?")}
              >
                <MessageSquare className="h-4 w-4 mr-1" />
                Ask AI
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={() => navigate('/accounting/transactions?filter=unreconciled')}
              >
                Reconcile Now
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* AR Overview Widget */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Accounts Receivable</CardTitle>
            </div>
            <CardDescription>Collections overview</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Three metrics in a row */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              {/* Total Overdue */}
              <div className="text-center p-3 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-600">
                  {formatCurrency(AR_DATA.totalOverdue)}
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  {AR_DATA.overdueCount} invoices overdue
                </div>
              </div>

              {/* DSO */}
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {AR_DATA.dso}
                </div>
                <div className="text-xs text-gray-600 mt-1">Days Sales Outstanding</div>
              </div>

              {/* Top Priority */}
              <div className="text-center p-3 bg-amber-50 rounded-lg">
                <div className="text-sm font-semibold text-amber-700 truncate">
                  {AR_DATA.topCustomer.name}
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  {AR_DATA.topCustomer.invoiceCount} invoices • {formatCurrency(AR_DATA.topCustomer.overdueAmount)}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => openChatWithMessage("Who should I follow up with for collections?")}
              >
                <MessageSquare className="h-4 w-4 mr-1" />
                Ask AI
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={() => navigate('/sales/invoices')}
              >
                View Overdue
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: AI Insights + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Insights */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary-600" />
              <CardTitle className="text-lg">AI Insights</CardTitle>
            </div>
            <CardDescription>Recent findings from your data</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {AI_INSIGHTS.map((insight) => (
                <div
                  key={insight.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        insight.type === 'reconciliation'
                          ? 'bg-purple-100 text-purple-600'
                          : insight.type === 'ar'
                          ? 'bg-amber-100 text-amber-600'
                          : 'bg-blue-100 text-blue-600'
                      }`}
                    >
                      <insight.icon className="h-4 w-4" />
                    </div>
                    <span className="text-sm text-gray-700">{insight.text}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openChatWithMessage(insight.action)}
                    className="text-primary-600 hover:text-primary-700"
                  >
                    Ask more
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {QUICK_ACTIONS.map((action, idx) => (
                <button
                  key={idx}
                  onClick={() => navigate(action.path)}
                  className="w-full flex items-center gap-3 p-3 text-left bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <action.icon className="h-4 w-4 text-gray-600" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">
                      {action.title}
                    </div>
                  </div>
                  {action.aiAssisted && (
                    <Badge
                      count={<Sparkles className="h-3 w-3" />}
                      style={{ backgroundColor: '#7028a0' }}
                    />
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Data Sources */}
      <Card className="bg-gray-50">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Link2 className="h-4 w-4" />
              <span className="font-medium">Connected Sources:</span>
            </div>
            <div className="flex items-center gap-6">
              {DATA_SOURCES.map((source, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm">
                  <Building2 className="h-4 w-4 text-gray-400" />
                  <span className="font-medium text-gray-700">{source.name}</span>
                  <span className="text-green-600">•</span>
                  <span className="text-gray-500">
                    {source.lastSync || source.details}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AIDashboard;
