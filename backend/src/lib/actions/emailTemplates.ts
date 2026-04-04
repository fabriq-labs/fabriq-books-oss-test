/**
 * Get action suffix for email subject (e.g., "Submit" -> "Submitted")
 */
export const getActionSuffix = (action: string): string => {
    switch (action.toLowerCase()) {
        case "submit":
            return "Submitted";
        case "approve":
            return "Approved";
        case "deliver":
            return "Delivered";
        case "reject":
            return "Rejected";
        case "query":
            return "Queried";
        default:
            return action;
    }
};

/**
 * Generate HTML email template for workflow notifications
 */
export const generateWorkflowEmailTemplate = (
    assigned_user: any,
    created_user: any,
    type: any,
    instance_id: any,
    state_id: any,
    recipient_type: any,
    action_history: any,
    model_name?: string
): string => {
    // Use model_name if provided, otherwise default to 'requisition' for backward compatibility
    const modelPath = model_name;
    const url = `${process.env.PUBLIC_API_URL}/${model_name}/${instance_id}/state/${state_id}`;
    const viewUrl = `${process.env.PUBLIC_API_URL}/${modelPath}/${instance_id}/view/view_1`;
    const commonStyles = `
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap');
        body {
            font-family: "Roboto", sans-serif !important;
            background-color: #f7f9fc;
            margin: 0;
            padding: 0;
            color: #333333;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }
        .container {
            max-width: 600px;
            margin: 20px auto;
            background-color: #ffffff;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
            overflow: hidden;
            border: 1px solid #e0e0e0;
        }
        .header {
            padding: 24px 30px;
            text-align: center;
            border-bottom: 1px solid rgba(0, 0, 0, 0.05);
            background-color: #1a73e8;
            color: white;
        }
        .header h1 {
            margin: 0;
            font-size: 22px;
            font-weight: 600;
            letter-spacing: 0.3px;
            font-family: "Roboto", sans-serif !important;
        }
        .content {
            padding: 30px;
            font-size: 15px;
            line-height: 1.6;
            color: #4a4a4a;
            font-family: "Roboto", sans-serif !important;
        }
        .content p {
            margin: 0 0 16px;
            font-family: "Roboto", sans-serif !important;
        }
        .content strong {
            font-weight: 600;
            color: #2c2c2c;
            font-family: "Roboto", sans-serif !important;
        }
        .button {
            display: inline-block;
            padding: 10px 24px;
            margin: 20px 0;
            background-color: #0066cc;
            color: white !important;
            text-decoration: none;
            border-radius: 4px;
            font-size: 15px;
            font-weight: 500;
            text-align: center;
            transition: background-color 0.2s ease;
            font-family: "Roboto", sans-serif !important;
            border: none;
        }
        .button:hover {
            background-color: #0052a3;
        }
        .footer {
            padding: 20px 30px;
            font-size: 13px;
            color: #8c8c8c;
            text-align: center;
            background-color: #f9f9f9;
            border-top: 1px solid rgba(0, 0, 0, 0.05);
            font-family: "Roboto", sans-serif !important;
        }
        .footer p {
            margin: 0;
            font-family: "Roboto", sans-serif !important;
        }
        .divider {
            height: 1px;
            background-color: #eaeaea;
            margin: 24px 0;
        }
        .logo {
            margin-bottom: 15px;
        }
        .logo img {
            height: 40px;
        }
        .status {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 3px;
            font-size: 13px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-family: "Roboto", sans-serif !important;
        }
        * {
            font-family: "Roboto", sans-serif !important;
        }
    `;
    if (recipient_type === 'creator') {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Request Update Notification</title>
    <style>
        ${commonStyles}
        .status.pending {
            background-color: #ffedd5;
            color: #c2410c;
        }
        .status.approved {
            background-color: #dcfce7;
            color: #15803d;
        }
        .status.in-progress {
            background-color: #e0f2fe;
            color: #0369a1;
        }
        .button {
            background-color: #1a73e8;
        }
        .button:hover {
            background-color: #1557b0;
        }
        .info-box {
            background-color: #f8fafc;
            border-left: 4px solid #1a73e8;
            padding: 16px;
            margin: 20px 0;
            border-radius: 4px;
            border: 1px solid #e0e7ff;
        }
        .info-box p {
            margin: 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">
                <!-- Replace with your company logo -->
                <!-- <img src="https://your-company.com/logo.png" alt="Zeiv Logo"> -->
            </div>
            <h1>Request Update</h1>
        </div>
        <div class="content">         
        <p>Hello <strong>${created_user?.name || 'User'}</strong>,</p>            
            <p>Your <strong>${type?.display_name || type}</strong> has been <strong>${getActionSuffix(action_history?.action_name || '')}</strong> by <strong><i> ${action_history?.modifiedUser?.name || action_history?.performed_by || 'User'}</i> </strong> and in now in progress.</p>      
             <p>You will receive further updates as your request progresses through the workflow.</p>           
            <p> You can also click the button below to know the status at anytime.</p>
            <div style="text-align: center;">
                <a href="${viewUrl}" class="button">View Request</a>
            </div>
            
            <div class="divider"></div>
            
            <p>If you have any questions or need assistance, please contact our support team.</p>
            
            <p>Thank you for using our system.</p>
            
            <p>Best regards,<br>Zeiv Team</p>
        </div>
        <div class="footer">
            <p>© 2024 Zeiv. All rights reserved.</p>
            <p style="margin-top: 8px;">This is an automated message, please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
`;
    } else {
        // Template for the assigned user
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Action Required Notification</title>
    <style>
        ${commonStyles}
        .button {
            background-color: #1a73e8;
        }
        .button:hover {
            background-color: #1557b0;
        }
        .priority-badge {
            display: inline-block;
            padding: 4px 10px;
            background-color: #fef2f2;
            color: #dc2626;
            border-radius: 3px;
            font-size: 13px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 16px;
            border: 1px solid #fee2e2;
        }
        .request-details {
            background-color: #f8fafc;
            border-radius: 4px;
            padding: 16px;
            margin: 20px 0;
            border: 1px solid #e0e7ff;
        }
        .request-details h3 {
            margin-top: 0;
            margin-bottom: 12px;
            font-size: 16px;
            color: #2c2c2c;
            font-family: "Roboto", sans-serif !important;
        }
        .request-details p {
            margin: 8px 0;
            font-size: 14px;
            font-family: "Roboto", sans-serif !important;
        }
        .request-details .label {
            font-weight: 600;
            color: #4b5563;
            display: inline-block;
            width: 120px;
            font-family: "Roboto", sans-serif !important;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">
                <!-- Replace with your company logo -->
                <!-- <img src="https://your-company.com/logo.png" alt="Zeiv Logo"> -->
            </div>
            <h1>Action Required</h1>
        </div>
        <div class="content">
            <div class="priority-badge">Action Required</div>
            
            <p>Hello <strong>${assigned_user?.name || 'User'}</strong>,</p>
            
            <p>User <strong>${created_user?.name || 'User'}</strong> has submitted a <strong>${type?.display_name || type}</strong> that is waiting for your review.</p>
            
            <div class="request-details">
                <h3>Request Details</h3>
                <p><span class="label">Type:</span> ${type?.display_name || type}</p>
                <p><span class="label">Submitted by:</span> ${created_user?.name || 'User'}</p>
                <p><span class="label">Date:</span> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
            
            <p>Please review this request at your earliest convenience. You can access the request by clicking the button below:</p>
            
            <div style="text-align: center;">
                <a href="${url}" class="button">Review Request</a>
            </div>
            
            <div class="divider"></div>
            
            <p>If you have any questions or need assistance, please contact the system administrator.</p>
            
            <p>Thank you,<br>Zeiv Team</p>
        </div>
        <div class="footer">
            <p>© 2024 Zeiv. All rights reserved.</p>
            <p style="margin-top: 8px;">This is an automated message, please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
`;
    }
};

