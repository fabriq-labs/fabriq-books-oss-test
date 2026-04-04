import React, { useEffect, useState } from 'react';
import { Button, Avatar, Tabs, Steps } from 'antd';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { SendOutlined, UserOutlined } from '@ant-design/icons';
import { Card } from "@/components/ui/card";
import { viewAPI, workflowAPI } from '@/api/api';
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

const InvoiceApprovalPanel: React.FC<ApprovalPanelProps> = ({ requisitionId, status, type, actionId, workflowContext }) => {
    const [comment, setComment] = useState('');
    const [comments, setComments] = useState<Comment[]>([]);
    const [messages, setMessages] = useState<Comment[]>([]);
    const [isError, setError] = useState<any>({});
    const userDetails = getUserDetails();
    const currentUserId = userDetails?.user_id;

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

    const getStepDataFromHistory = (activityData: WorkflowHistory[]) => {
        if (!Array.isArray(activityData)) return [];

        return activityData.map(entry => {
            const fromState = entry.from_state || 'Unknown';
            const toState = entry.to_state || 'Unknown';
            const actionName = entry.action?.name || 'Transition';

            return {
                title: `${fromState} → ${toState}`,
                description: (
                    <div className="text-xs text-gray-600">
                        <div>
                            <span className="font-medium">Action:</span> {actionName}
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
            };
        });
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
        return createdBy === currentUserId;
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
                                        className={`p-2 rounded-md ${getCommentColor(msg.created_by)}`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <Avatar
                                                size="small"
                                                style={isCurrentUser(msg.created_by) ? { backgroundColor: '#7028a0' } : {}}
                                                icon={!isCurrentUser(msg.created_by) && <UserOutlined />}
                                            >
                                                {isCurrentUser(msg.created_by) ? 'You' : msg.user?.name?.charAt(0)}
                                            </Avatar>
                                            <p className="text-sm font-medium">
                                                {isCurrentUser(msg.created_by) ? 'You' : msg.user?.name}
                                            </p>
                                        </div>
                                        <p className="text-xs text-gray-500">{msg.created_at && formatDate(msg.created_at)}</p>
                                        <p className="mt-1 text-sm">{msg.comment}</p>
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
                            current={(workflowContext?.history || []).length - 1}
                            items={getStepDataFromHistory(workflowContext?.history || [])}
                            className="max-w-full"
                            status="process"
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

export default InvoiceApprovalPanel;