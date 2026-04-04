import React, { useEffect, useState } from 'react';
import { Button, Avatar, Tabs, Steps } from 'antd';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { SendOutlined, UserOutlined } from '@ant-design/icons';
import { Card } from "@/components/ui/card";
import { userAPI, viewAPI, workflowAPI } from '@/api/api';
import { getUserDetails } from '@/utils/auth';

interface Comment {
  id: string;
  comment: string;
  history_id: string | null;
  created_by: string;
  created_at: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

interface WorkflowAction {
  id: string;
  name: string;
  target_state_id: string;
}

interface WorkflowState {
  id: string;
  name: string;
  assigned_for: string;
  assigned_user_id: string | null;
  assigned_role_id: string | null;
  assigned_expression: string;
  source_actions: WorkflowAction[];
}

interface WorkflowHistory {
  id: string;
  performed_by: string;
  performed_by_user?: {
    id: string;
    name: string;
    email: string;
  };
  performed_at: string;
  from_state: string;
  to_state: string;
  action: {
    id: string;
    name: string;
  };
}

interface WorkflowFlow {
  id: string;
  model_name: string;
  name: string;
}

interface WorkflowContext {
  id: string;
  flow_id: string;
  model_id: string;
  current_state_id: string;
  assigned_user_id: string;
  status: string;
  created_by: string;
  modified_by: string;
  created_at: string;
  modified_at: string;
  flow: WorkflowFlow;
  current_state_ref: WorkflowState;
  history: WorkflowHistory[];
  comments: Comment[];
}

interface ApprovalPanelProps {
  requisitionId: string;
  status: string;
  type: string;
  actionId: string;
  workflowContext: WorkflowContext;
}

const ApprovalPanel: React.FC<ApprovalPanelProps> = ({ requisitionId, status, type, actionId, workflowContext }) => {
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [messages, setMessages] = useState<Comment[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isError, setError] = useState<any>({});
  const userDetails = getUserDetails();

  useEffect(() => {
    getCurrentLoginedUser();
  }, []);
  const getCurrentLoginedUser = () => {
    userAPI.getCurrentUser().then((res: any) => {
      setCurrentUser(res?.data?.id);
    }).catch((err) => {
      console.log(err);
    });
  }
  useEffect(() => {
    if (workflowContext?.comments) {
      setComments(workflowContext.comments);
      setMessages(workflowContext.comments);
    }

  }, [workflowContext]);

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setComment(e.target.value);
  };

  const handleSendMessage = (e: any) => {
    e.preventDefault();
    if (comment.trim() === "") return;

    // Use the new workflow comment API endpoint
    workflowAPI.createComment(workflowContext.id, { comment: comment })
      .then((res: any) => {
        // Add the new comment directly to the state
        const newComment = {
          id: res.data.id,
          comment: res.data.comment,
          history_id: res.data.history_id,
          created_by: res.data.created_by,
          created_at: res.data.created_at,
          user: {
            id: res.data.created_by,
            name: userDetails?.name || 'You',
            email: userDetails?.email || ''
          }
        };
        setComments(prev => [...prev, newComment]);
        setMessages(prev => [...prev, newComment]);
      })
      .catch((err) => {
        const { response } = err;
        console.error("Error creating comment:", err.message);
      });
    setComment("");
  };

  // Hardcoded workflow states
  const workflowStates = [
    { id: 'draft', name: 'Draft' },
    { id: 'manager_review', name: 'Manager Review' },
    { id: 'buyer_review', name: 'Buyer Review' },
    { id: 'delivery', name: 'Delivery' }
  ];

  // Function to get state number for Send Back actions
  const getStateNumber = (stateName: string): number => {
    const stateMap: { [key: string]: number } = {
      'Draft': 1,
      'Manager Review': 2,
      'Buyer Review': 3,
      'Delivery': 4
    };
    return stateMap[stateName] || 1;
  };

  const getStepDataFromHistory = (activityData: WorkflowHistory[]) => {
    // Get current state from workflow context
    const currentState = workflowContext?.current_state_ref?.name || 'Draft';

    // If no history data, show hardcoded states with proper status logic
    if (!Array.isArray(activityData) || activityData.length === 0) {
      return workflowStates.map((state, index) => {
        let isCompleted = false;
        let isCurrent = false;
        let isFuture = false;

        // Apply the same logic as when there is history data
        if (index === 0) {
          isCompleted = currentState !== 'Draft';
          isCurrent = currentState === 'Draft';
          isFuture = !isCompleted && !isCurrent;
        } else if (index === 1) {
          isCompleted = currentState === 'Buyer Review' || currentState === 'Delivery';
          isCurrent = currentState === 'Manager Review';
          isFuture = !isCompleted && !isCurrent;
        } else if (index === 2) {
          isCompleted = currentState === 'Delivery';
          isCurrent = currentState === 'Buyer Review';
          isFuture = !isCompleted && !isCurrent;
        } else if (index === 3) {
          isCompleted = false;
          isCurrent = currentState === 'Delivery';
          isFuture = !isCompleted && !isCurrent;
        }

        let transitionTitle = '';
        if (index === 0) {
          transitionTitle = `${workflowStates[0].name} → ${workflowStates[1].name}`;
        } else if (index === 1) {
          transitionTitle = `${workflowStates[1].name} → ${workflowStates[2].name}`;
        } else if (index === 2) {
          transitionTitle = `${workflowStates[2].name} → ${workflowStates[3].name}`;
        } else if (index === 3) {
          transitionTitle = `${workflowStates[3].name}`;
        }

        let status: 'wait' | 'process' | 'finish' | 'error' = 'wait';
        let icon: React.ReactNode = null;

        if (isCompleted) {
          status = 'finish';
          icon = <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center">
            <span className="text-white text-xs">✓</span>
          </div>;
        } else if (isCurrent) {
          status = 'process';
          icon = <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">{index + 1}</span>
          </div>;
        } else if (isFuture) {
          status = 'wait';
          icon = <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
            <span className="text-gray-500 text-xs font-bold">{index + 1}</span>
          </div>;
        }

        return {
          title: (
            <span className={isFuture ? 'text-gray-400' : 'text-black'}>
              {transitionTitle}
            </span>
          ),
          description: null,
          status,
          icon,
        };
      });
    }

    // Check if there are any Send Back actions in the history
    const hasSendBackActions = activityData.some(entry =>
      entry.action.name === 'Send Back ' || entry.action.name === 'Send Back'
    );
    if (hasSendBackActions) {
      // Dynamic workflow - show all actual transitions including Send Back actions
      const workflowSteps: Array<{
        title: React.ReactNode;
        description: React.ReactNode;
        status: 'wait' | 'process' | 'finish' | 'error';
        icon: React.ReactNode;
      }> = [];

      // Process each activity entry to create workflow steps
      activityData.forEach((entry, index) => {
        const isLastEntry = index === activityData.length - 1;
        const isSendBackAction = entry.action.name === 'Send Back ' || entry.action.name === 'Send Back';

        // For Send Back workflows, all entries should be marked as completed since they represent completed transitions
        // The current state is shown separately if needed
        const isCompletedEntry = true; // All entries in Send Back workflows are completed
        const isCurrentEntry = false; // No entries are current in Send Back workflows

        // Create transition title
        let transitionTitle = `${entry.from_state} → ${entry.to_state}`;

        // Determine status and icon
        let status: 'wait' | 'process' | 'finish' | 'error' = 'wait';
        let icon: React.ReactNode = null;

        if (isSendBackAction) {
          // Special handling for Send Back actions - show number based on target state
          const targetStateNumber = getStateNumber(entry.to_state);
          status = 'finish';
          icon = <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
            <span className="text-white text-xs font-bold">{targetStateNumber}</span>
          </div>;
        } else if (isCompletedEntry) {
          status = 'finish';
          icon = <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center">
            <span className="text-white text-xs">✓</span>
          </div>;
        } else if (isCurrentEntry) {
          status = 'process';
          icon = <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">{index + 1}</span>
          </div>;
        }

        workflowSteps.push({
          title: (
            <span className="text-black">
              {transitionTitle}
            </span>
          ),
          description: (
            <div className="text-xs text-gray-600">
              <div>
                <span className="font-medium">Action:</span> {entry.action.name}
              </div>
              {(entry.performed_by_user || entry.performed_by) && (
                <div>
                  <span className="font-medium">User:</span> {entry.performed_by_user?.name || entry.performed_by}
                </div>
              )}
              {entry.performed_at && (
                <div>
                  <span className="font-medium">Created:</span>{' '}
                  {new Intl.DateTimeFormat('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(new Date(entry.performed_at))}
                </div>
              )}
            </div>
          ),
          status,
          icon,
        });
      });

      // For Send Back workflows, if current state is Delivery, add it as a separate current state step
      if (currentState === 'Delivery') {
        workflowSteps.push({
          title: (
            <span className="text-black">
              Delivery
            </span>
          ),
          description: null,
          status: 'process',
          icon: <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">4</span>
          </div>
        });
      }

      return workflowSteps;
    } else {
      // Standard 4-step workflow - show all 4 steps with proper status
      const workflowSteps: Array<{
        title: React.ReactNode;
        description: React.ReactNode;
        status: 'wait' | 'process' | 'finish' | 'error';
        icon: React.ReactNode;
      }> = [];

      // Define the standard workflow transitions
      const standardTransitions = [
        { from: 'Draft', to: 'Manager Review', stepNumber: 1 },
        { from: 'Manager Review', to: 'Buyer Review', stepNumber: 2 },
        { from: 'Buyer Review', to: 'Delivery', stepNumber: 3 }
      ];

      // Process each standard transition
      standardTransitions.forEach((transition, index) => {
        const isCompletedState = getStateNumber(currentState) > transition.stepNumber;

        // Find the corresponding activity entry for this transition
        const activityEntry = activityData.find(entry =>
          entry.from_state === transition.from && entry.to_state === transition.to
        );

        // Create transition title
        const transitionTitle = `${transition.from} → ${transition.to}`;

        // Determine status and icon
        let status: 'wait' | 'process' | 'finish' | 'error' = 'wait';
        let icon: React.ReactNode = null;

        if (isCompletedState) {
          status = 'finish';
          icon = <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center">
            <span className="text-white text-xs">✓</span>
          </div>;
        } else {
          status = 'wait';
          icon = <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
            <span className="text-gray-500 text-xs font-bold">{transition.stepNumber}</span>
          </div>;
        }

        workflowSteps.push({
          title: (
            <span className={isCompletedState ? 'text-black' : 'text-gray-400'}>
              {transitionTitle}
            </span>
          ),
          description: (
            <div className="text-xs text-gray-600">
              {activityEntry && (
                <>
                  <div>
                    <span className="font-medium">Action:</span> {activityEntry.action.name}
                  </div>
                  {(activityEntry.performed_by_user || activityEntry.performed_by) && (
                    <div>
                      <span className="font-medium">User:</span> {activityEntry.performed_by_user?.name || activityEntry.performed_by}
                    </div>
                  )}
                  {activityEntry.performed_at && (
                    <div>
                      <span className="font-medium">Created:</span>{' '}
                      {new Intl.DateTimeFormat('en-GB', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(new Date(activityEntry.performed_at))}
                    </div>
                  )}
                </>
              )}
            </div>
          ),
          status,
          icon,
        });
      });

      // Add Delivery as a separate final state step for standard workflow
      const isDeliveryCurrent = currentState === 'Delivery';
      workflowSteps.push({
        title: (
          <span className="text-black">
            Delivery
          </span>
        ),
        description: null,
        status: isDeliveryCurrent ? 'process' : 'wait',
        icon: isDeliveryCurrent ? (
          <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">4</span>
          </div>
        ) : (
          <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
            <span className="text-gray-500 text-xs font-bold">4</span>
          </div>
        )
      });

      return workflowSteps;
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch (error) {
      return dateString;
    }
  };

  const isCurrentUser = (createdBy: string) => {
    return createdBy === currentUser;
  };

  const getCommentColor = (createdBy: string) => {
    return isCurrentUser(createdBy) ? 'bg-blue-50' : 'bg-gray-100';
  };

  const items = [
    {
      key: '1',
      label: 'Comments',
      children: (
        <div className="h-full px-4">
          <ScrollArea className="h-[495px] pr-2 mb-3">
            <div className="space-y-3">
              {messages.map((msg: Comment) => {
                return (
                  <div
                    key={msg.id}
                    className={`p-2 rounded-md ${getCommentColor(msg?.created_by)}`}
                  >
                    <div className="flex items-center gap-2">
                      <Avatar
                        size="small"
                        style={isCurrentUser(msg?.created_by) ? { backgroundColor: '#7028a0' } : {}}
                        icon={!isCurrentUser(msg?.created_by) && <UserOutlined />}
                      >
                        {isCurrentUser(msg?.created_by) ? 'You' : msg.user?.name?.charAt(0)}
                      </Avatar>
                      <p className="text-sm font-medium">
                        {isCurrentUser(msg?.created_by) ? 'You' : msg.user?.name}
                      </p>
                    </div>
                    <p className="text-xs text-gray-500">{msg?.created_at && formatDate(msg?.created_at)}</p>
                    <p className="mt-1 text-sm">{msg?.comment}</p>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <div className="bg-white rounded-md mb-2">
            <Textarea
              value={comment}
              onChange={handleCommentChange}
              placeholder="Write a comment..."
              className="mb-2 border rounded-md min-h-[40px]"
            />
            <div className="flex justify-end">
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={handleSendMessage}
                disabled={!comment.trim()}
                size="small"
              >
                Send
              </Button>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: '2',
      label: 'Approvals',
      children: (
        <ScrollArea className="h-[495px] px-4">
          <div className="p-2">
            <Steps
              direction="vertical"
              size="small"
              items={getStepDataFromHistory(workflowContext?.history || [])}
              className="max-w-full"
            />
          </div>
        </ScrollArea>
      ),
    },
  ];

  return (
    <Card className="bg-white rounded-lg shadow-sm overflow-hidden mt-4" style={{ height: 'auto', minHeight: '585px' }}>
      <Tabs items={items} defaultActiveKey="1" className="pl-3" />
    </Card>
  );
};

export default ApprovalPanel;