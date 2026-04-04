import prisma from '../prisma';

export const get_my_feed = async (userId: string, orgId: string) => {
  return await prisma.$queryRaw`
      SELECT 
        wh.from_state as source_state_name,
        wh.to_state as target_state_name,
        wh.performed_by,
        wh.performed_at as modified_at,
        wa.name as action_name,
        u.name as modified_by_name,
        u.email as modified_by_email,                 
        wi.current_state AS wi_current_state,          
        pr.pr_number,
        pr.pr_date,
        pr.total_price,
        pr.status,
        pr.name as pr_name,
        pr.comment as pr_comment
        FROM workflow_history wh
        left join workflow_action wa on wa.id = wh.action_id
        left join "user" u on u.id = wh.performed_by
        left join workflow_instance wi on wi.id = wh.instance_id
        left join purchase_requisition pr on pr.id = wi.model_id
        WHERE wi.created_by = ${userId}
          AND wi.org_id = ${orgId}
    `;
};

