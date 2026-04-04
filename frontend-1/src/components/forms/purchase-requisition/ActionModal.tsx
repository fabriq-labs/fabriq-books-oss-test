import React, { useState, useEffect } from "react";
import { Modal, Button, Input, Form, Select } from "antd";
import { workflowAPI } from '@/api/api';
// import { fetchQuery } from "@/views/api/api";
const { TextArea } = Input;
const { Option } = Select;
export const ActionModal = ({
    isOpen,
    onOk,
    onCancel,
    comment,
    setComment,
    action,
    setAction,
    handleActions,
    id,
    state,
    workflowContext,
    actionData,
}: any) => {
    const [form] = Form.useForm();
    const [validationTriggered, setValidationTriggered] = useState(false);
    const [selectedState, setSelectedState] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [previousState, setPreviousState] = useState([]);


    const handleOk = async () => {
        setValidationTriggered(true);
        setIsLoading(true);
        form
            .validateFields() // Triggers validation for all form fields
            .then(async () => {
                try {
                    // Create a comment if there's content and workflowContext
                    if (comment?.content && workflowContext?.id) {
                        try {
                            await workflowAPI.createComment(workflowContext.id, {
                                comment: comment.content
                            });
                        } catch (commentError) {
                            console.log("Comment creation failed:", commentError);
                            // Continue with the action even if comment fails
                        }
                    }
                    await onOk(); // Wait for the API call to complete
                    setValidationTriggered(false);
                    setIsLoading(false);
                    // Clear form and reset state after successful action
                    form.resetFields();
                    setComment({ content: "" });
                    setAction({});
                } catch (error) {
                    console.log("API call failed:", error);
                    setValidationTriggered(false);
                    setIsLoading(false);
                }
            })
            .catch((info) => {
                console.log("Validation Failed:", info);
                setIsLoading(false);
            });
    };
    const handleCancel = () => {
        // Clear form and reset state when modal is cancelled
        form.resetFields();
        setComment({ content: "" });
        setAction({});
        onCancel();
    };

    const handleDropdownChange = (value: any) => {
        // Find the selected action from actionData
        const selectedAction = actionData.find((item: any) => item.id === value);
        if (selectedAction) {
            setAction({
                ...action,
                id: selectedAction.id,
                target_state_id: selectedAction.target_state_id,
                name: selectedAction.name,
            });
        }
    };

    return (
        <Modal
            title={`Enter Your Reason`}
            open={isOpen}
            onOk={onOk}
            onCancel={handleCancel}
            maskClosable={false}
            footer={[
                <Button key="back" onClick={handleCancel}>
                    Cancel
                </Button>,
                <Button
                    key="submit"
                    type="primary"
                    onClick={handleOk}
                    loading={isLoading}
                >
                    Send Back
                </Button>,
            ]}
        >
            <Form
                form={form}
                layout="vertical"
                initialValues={{ comment: comment?.content }}
            >
                <Form.Item
                    name="comment"
                    label="Comment"
                    rules={[{ required: true, message: "Please enter your reason!" }]}
                >
                    <TextArea
                        value={comment?.content}
                        onChange={(e) => {
                            setComment({ content: e.target.value });
                            if (validationTriggered) {
                                form.validateFields(["comment"]);
                            }
                        }}
                        placeholder={`Enter Your Reason`}
                        rows={4}
                    />
                </Form.Item>


                {/* Dropdown for target states from actionData - filtered for "Send Back" actions only */}
                {actionData && actionData?.length > 0 && actionData.filter((item: any) => item?.name?.trim() === "Send Back").length > 0 && (
                    <Form.Item label="Select Send to" name="action_id"
                        rules={[{ required: true, message: "Please select a target state!" }]}>
                        <Select
                            placeholder="Select a target state"
                            onChange={handleDropdownChange}
                            value={action?.id}
                        >
                            {actionData
                                .filter((item: any) => item?.name?.trim() === "Send Back")
                                .map((item: any) => {
                                    // Find matching history entry where from_state matches target_state name
                                    const matchingHistory = workflowContext?.history?.find(
                                        (historyItem: any) => historyItem?.from_state === item?.target_state?.name
                                    );

                                    // Get the user name from the matching history entry
                                    const userName = matchingHistory?.performed_by_user?.name;

                                    // Display format: "State Name (User Name)" if user found, otherwise just "State Name"
                                    const displayText = userName
                                        ? `${item?.target_state?.name} (${userName})`
                                        : item?.target_state?.name;

                                    return (
                                        <Option
                                            key={item?.id}
                                            value={item?.id}
                                        >
                                            {displayText}
                                        </Option>
                                    );
                                })}
                        </Select>
                    </Form.Item>
                )}
            </Form>
        </Modal>
    );
};