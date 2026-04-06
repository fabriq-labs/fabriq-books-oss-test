import React, { useState } from 'react';
import { Card, Form, Select, Checkbox, Typography } from 'antd';
import { UseFormReturn } from 'react-hook-form';
import { SearchDropDown } from '@/components/search_dropdown/dropdown';

const { Option } = Select;
const { Title } = Typography;

interface FinancialInformationProps {
  form: UseFormReturn<any>;
  readOnly?: boolean;
  details: any;
  setDetails: any;
  onSubmit?: any
}

const FinancialInformation: React.FC<FinancialInformationProps> = ({ form, readOnly = false, details, setDetails, onSubmit }) => {
  const [field, setField] = useState<string | null>(null);
  const isBudgeted = details?.on_budget || false;
  const budgetLevel = details?.budget_level || '';
  const isForProject = details?.on_project || false;

  React.useEffect(() => {
    if (details) {

      if (details.on_budget !== undefined) {
        form.setValue('on_budget', details.on_budget);
      }
      if (details.budget_level !== undefined) {
        form.setValue('budget_level', details.budget_level);
      }
      if (details.on_project !== undefined) {
        form.setValue('on_project', details.on_project);
      }
    }
  }, [details, form]);

  const handleBudgetedChange = async (e: any) => {
    const checked = e.target.checked;
    if (checked !== details.on_budget) {
      setDetails({
        ...details,
        on_budget: checked
      });
      form.setValue('on_budget', checked);
      await handleFieldUpdate("on_budget", checked);
    }
  };

  const handleProjectChange = async (e: any) => {
    const checked = e.target.checked;
    if (checked !== details.on_project) {
      setDetails({
        ...details,
        on_project: checked
      });
      form.setValue('on_project', checked);
      await handleFieldUpdate("on_project", checked);
    }
  };

  const handleBudgetLevelChange = async (value: string) => {
    setDetails({
      ...details,
      budget_level: value
    });
    form.setValue('budget_level', value);
  };


  const handleFieldUpdate = async (fieldName: string, value: any) => {
    if (readOnly) return;
    setField(fieldName);
    await onSubmit({ [fieldName]: value });
    setField(null);
  };

  const handleSelectChange = async (
    sourceKey: any,
    key: any,
    value: any,
    fields: any
  ) => {
    setDetails({
      ...details,
      [sourceKey]: value[key],
    });

    await onSubmit({ [sourceKey]: value[key] });
  };


  const handleSelectClear = (sourceKey: any) => {
    setDetails({
      ...details,
      [sourceKey]: "",
    });
  };

  return (
    <Card title="Financial Information" className="h-full">
      <Form layout="vertical" className="space-y-4">
        <Form.Item
          label="Legal Entity"
          name="legal_entity_id"
          className='mb-0'
        >
          <SearchDropDown
            instanceType="organization"
            instanceSourceKey="legal_entity_id"
            instanceKey="id"
            instanceLabel="legal_name"
            instanceValue={
              details?.organization
            }
            onSelectItem={handleSelectChange}
            onClear={handleSelectClear}
            limit="10"
            searchParams="legal_name"
            disabled={readOnly}
          ></SearchDropDown>
        </Form.Item>

        <Form.Item className='mb-0'>
          <Checkbox
            checked={isBudgeted}
            onChange={handleBudgetedChange}
            disabled={readOnly}
          >
            Budgeted?
          </Checkbox>
        </Form.Item>

        {isBudgeted && (
          <>
            <Form.Item label="Budget Level" className='mb-0'>
              <Select
                style={{ width: '100%' }}
                placeholder="Select budget level"
                value={details?.budget_level}
                disabled={readOnly}
                onChange={(value) => {
                  handleBudgetLevelChange(value); // update both details and form
                }}
                onBlur={() => {
                  if (!readOnly && details?.budget_level) {
                    handleFieldUpdate("budget_level", details.budget_level);
                  }
                }}

              >
                <Option value="Header">Header</Option>
                <Option value="Line">Line</Option>
              </Select>
            </Form.Item>

            {budgetLevel === 'Header' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Form.Item label="Cost Center" name="cost_center_id" className='mb-0'>
                  <SearchDropDown
                    instanceType="cost_center"
                    instanceSourceKey="cost_center_id"
                    instanceKey="id"
                    instanceLabel="cost_center"
                    instanceValue={
                      details?.cost_center
                    }
                    onSelectItem={handleSelectChange}
                    onClear={handleSelectClear}
                    searchParams="cost_center"
                    type="purchase_requisition"
                    disabled={readOnly}
                  />
                </Form.Item>

                <Form.Item label="Budget Period" name="budget_period" className='mb-0'>
                  <SearchDropDown
                    instanceType="budget_period"
                    instanceSourceKey="budget_period"
                    instanceKey="id"
                    instanceLabel="budget_period"
                    instanceValue={
                      details?.budget_period_obj
                    }
                    onSelectItem={handleSelectChange}
                    onClear={handleSelectClear}
                    searchParams="budget_period"
                    type="budget_period"
                    disabled={readOnly}

                  />
                </Form.Item>

                <Form.Item label="Budget Line" name="budget_line" className='mb-0'>
                  <SearchDropDown
                    instanceType="budget_line"
                    instanceSourceKey="budget_line"
                    instanceKey="id"
                    instanceLabel="budget_line"
                    instanceValue={
                      details?.budget_line_obj
                    }
                    onSelectItem={handleSelectChange}
                    onClear={handleSelectClear}
                    searchParams="budget_line"
                    type="budget_line"
                    disabled={readOnly}
                  />
                </Form.Item>
              </div>
            )}
          </>
        )}

        <Form.Item className='mb-0'>
          <Checkbox
            checked={isForProject}
            onChange={handleProjectChange}
            disabled={readOnly}
          >
            Is this for Project?
          </Checkbox>
        </Form.Item>

        {isForProject && (
          <Form.Item label="Project Name" name="project_name" className='mb-0'>
            <SearchDropDown
              instanceType="project_master"
              instanceSourceKey="project_name"
              instanceKey="id"
              instanceLabel="project_name"
              instanceValue={
                details?.project_master_obj
              }
              onSelectItem={handleSelectChange}
              onClear={handleSelectClear}
              searchParams="project_name"
              type="project_master"
              disabled={readOnly}
            ></SearchDropDown>
          </Form.Item>
        )}
      </Form>
    </Card>
  );
};

export default FinancialInformation;
