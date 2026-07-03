import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react';

type ConditionSource = 'query' | 'header' | 'body';
type ConditionOperator = 'equals' | 'not_equals' | 'exists' | 'not_exists' | 'contains';
type MatchMode = 'all' | 'any';

type ConditionForm = {
  source: ConditionSource;
  key: string;
  operator: ConditionOperator;
  value: string;
};

type RuleFormState = {
  ruleId?: string;
  name: string;
  matchMode: MatchMode;
  conditions: ConditionForm[];
  statusCode: number;
  responseType: 'json' | 'url_encoded';
  responseBody: string;
};

const SOURCE_LABELS: Record<ConditionSource, string> = {
  query: 'Query parameter',
  header: 'Header',
  body: 'Body field',
};

const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  equals: 'equals',
  not_equals: 'not equals',
  exists: 'exists',
  not_exists: 'does not exist',
  contains: 'contains',
};

const emptyCondition = (): ConditionForm => ({
  source: 'query',
  key: 'status',
  operator: 'equals',
  value: 'pending',
});

const emptyRuleForm = (): RuleFormState => ({
  name: '',
  matchMode: 'all',
  conditions: [emptyCondition()],
  statusCode: 200,
  responseType: 'json',
  responseBody: JSON.stringify(
    {
      orders: {
        __fakerArray: {
          min: 3,
          max: 3,
          item: {
            id: '{{faker.string.uuid}}',
            status: 'pending',
          },
        },
      },
    },
    null,
    2
  ),
});

function conditionSummary(c: ConditionForm): string {
  const src = c.source === 'query' ? '?' : c.source === 'header' ? 'header ' : 'body ';
  const key = c.source === 'query' ? c.key : c.key;
  if (c.operator === 'exists') return `${src}${key} exists`;
  if (c.operator === 'not_exists') return `${src}${key} missing`;
  return `${src}${key} ${OPERATOR_LABELS[c.operator]} "${c.value}"`;
}

type RouteRuleBuilderProps = {
  teamId: string;
  projectId: string;
  apiId: string;
  routeId: string;
};

export function RouteRuleBuilder({ teamId, projectId, apiId, routeId }: RouteRuleBuilderProps) {
  const [showForm, setShowForm] = useState(false);
  const [ruleForm, setRuleForm] = useState<RuleFormState>(emptyRuleForm);
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const rulesQuery = trpc.mockApi.rules.list.useQuery({
    teamId,
    projectId,
    apiId,
    routeId,
  });

  const createMutation = trpc.mockApi.rules.create.useMutation({
    onSuccess: () => {
      void utils.mockApi.rules.list.invalidate({ teamId, projectId, apiId, routeId });
      void utils.mockApi.rules.listForApi.invalidate({ teamId, projectId, apiId });
      setShowForm(false);
      setRuleForm(emptyRuleForm());
    },
  });

  const updateMutation = trpc.mockApi.rules.update.useMutation({
    onSuccess: () => {
      void utils.mockApi.rules.list.invalidate({ teamId, projectId, apiId, routeId });
      void utils.mockApi.rules.listForApi.invalidate({ teamId, projectId, apiId });
      setShowForm(false);
      setRuleForm(emptyRuleForm());
    },
  });

  const deleteMutation = trpc.mockApi.rules.delete.useMutation({
    onSuccess: () => {
      void utils.mockApi.rules.list.invalidate({ teamId, projectId, apiId, routeId });
      void utils.mockApi.rules.listForApi.invalidate({ teamId, projectId, apiId });
      setDeleteRuleId(null);
    },
  });

  const reorderMutation = trpc.mockApi.rules.reorder.useMutation({
    onSuccess: () => {
      void utils.mockApi.rules.list.invalidate({ teamId, projectId, apiId, routeId });
      void utils.mockApi.rules.listForApi.invalidate({ teamId, projectId, apiId });
    },
  });

  const startEdit = (rule: NonNullable<typeof rulesQuery.data>[number]) => {
    setRuleForm({
      ruleId: rule.id,
      name: rule.name ?? '',
      matchMode: rule.match_mode,
      conditions: rule.conditions.map((c) => ({
        source: c.source,
        key: c.key,
        operator: c.operator,
        value: c.value ?? '',
      })),
      statusCode: rule.status_code,
      responseType: rule.response_type,
      responseBody: rule.response_body,
    });
    setShowForm(true);
  };

  const saveRule = async () => {
    const conditions = ruleForm.conditions.map((c) => {
      const base = { source: c.source, key: c.key, operator: c.operator };
      if (c.operator === 'exists' || c.operator === 'not_exists') {
        return base;
      }
      return { ...base, value: c.value };
    });

    const payload = {
      teamId,
      projectId,
      apiId,
      routeId,
      name: ruleForm.name || undefined,
      matchMode: ruleForm.matchMode,
      conditions,
      statusCode: ruleForm.statusCode,
      responseType: ruleForm.responseType,
      responseBody: ruleForm.responseBody,
    };

    if (ruleForm.ruleId) {
      await updateMutation.mutateAsync({ ...payload, ruleId: ruleForm.ruleId });
    } else {
      await createMutation.mutateAsync(payload);
    }
  };

  const moveRule = (index: number, direction: -1 | 1) => {
    const rules = rulesQuery.data;
    if (!rules) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= rules.length) return;
    const ids = rules.map((r) => r.id);
    const [removed] = ids.splice(index, 1);
    ids.splice(newIndex, 0, removed);
    void reorderMutation.mutateAsync({ teamId, projectId, apiId, routeId, ruleIds: ids });
  };

  const mutationError = createMutation.error ?? updateMutation.error ?? deleteMutation.error;

  const selectClass =
    'flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm';

  return (
    <div className="space-y-3 border-t pt-4 mt-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Response rules</p>
          <p className="text-xs text-muted-foreground">
            Match query params, headers, or body fields. First matching rule wins; otherwise the
            fallback response above is used.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setRuleForm(emptyRuleForm());
            setShowForm((v) => !v);
          }}
        >
          {showForm ? 'Cancel' : 'Add rule'}
        </Button>
      </div>

      {showForm ? (
        <div className="space-y-4 rounded-md border p-4 bg-muted/20">
          <div className="space-y-2">
            <Label htmlFor="ruleName">Rule name (optional)</Label>
            <Input
              id="ruleName"
              value={ruleForm.name}
              onChange={(e) => setRuleForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Pending orders"
            />
          </div>

          <div className="space-y-2">
            <Label>Match mode</Label>
            <select
              className={selectClass}
              value={ruleForm.matchMode}
              onChange={(e) =>
                setRuleForm((f) => ({ ...f, matchMode: e.target.value as MatchMode }))
              }
            >
              <option value="all">All conditions</option>
              <option value="any">Any condition</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label>Conditions</Label>
            {ruleForm.conditions.map((cond, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                <div className="md:col-span-3">
                  <select
                    className={selectClass}
                    value={cond.source}
                    onChange={(e) =>
                      setRuleForm((f) => {
                        const conditions = [...f.conditions];
                        conditions[idx] = {
                          ...conditions[idx],
                          source: e.target.value as ConditionSource,
                        };
                        return { ...f, conditions };
                      })
                    }
                  >
                    {(Object.keys(SOURCE_LABELS) as ConditionSource[]).map((s) => (
                      <option key={s} value={s}>
                        {SOURCE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <Input
                    placeholder="Key"
                    value={cond.key}
                    onChange={(e) =>
                      setRuleForm((f) => {
                        const conditions = [...f.conditions];
                        conditions[idx] = { ...conditions[idx], key: e.target.value };
                        return { ...f, conditions };
                      })
                    }
                  />
                </div>
                <div className="md:col-span-3">
                  <select
                    className={selectClass}
                    value={cond.operator}
                    onChange={(e) =>
                      setRuleForm((f) => {
                        const conditions = [...f.conditions];
                        conditions[idx] = {
                          ...conditions[idx],
                          operator: e.target.value as ConditionOperator,
                        };
                        return { ...f, conditions };
                      })
                    }
                  >
                    {(Object.keys(OPERATOR_LABELS) as ConditionOperator[]).map((op) => (
                      <option key={op} value={op}>
                        {OPERATOR_LABELS[op]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-3">
                  {cond.operator !== 'exists' && cond.operator !== 'not_exists' ? (
                    <Input
                      placeholder="Value"
                      value={cond.value}
                      onChange={(e) =>
                        setRuleForm((f) => {
                          const conditions = [...f.conditions];
                          conditions[idx] = { ...conditions[idx], value: e.target.value };
                          return { ...f, conditions };
                        })
                      }
                    />
                  ) : (
                    <div className="h-9" />
                  )}
                </div>
                <div className="md:col-span-1 flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={ruleForm.conditions.length <= 1}
                    onClick={() =>
                      setRuleForm((f) => ({
                        ...f,
                        conditions: f.conditions.filter((_, i) => i !== idx),
                      }))
                    }
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setRuleForm((f) => ({ ...f, conditions: [...f.conditions, emptyCondition()] }))
              }
            >
              <Plus className="w-4 h-4 mr-1" />
              Add condition
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status code</Label>
              <Input
                type="number"
                value={ruleForm.statusCode}
                onChange={(e) =>
                  setRuleForm((f) => ({ ...f, statusCode: Number(e.target.value) }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Response type</Label>
              <select
                className={selectClass}
                value={ruleForm.responseType}
                onChange={(e) =>
                  setRuleForm((f) => ({
                    ...f,
                    responseType: e.target.value as 'json' | 'url_encoded',
                  }))
                }
              >
                <option value="json">json</option>
                <option value="url_encoded">url_encoded</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Response body</Label>
            <textarea
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              value={ruleForm.responseBody}
              onChange={(e) => setRuleForm((f) => ({ ...f, responseBody: e.target.value }))}
            />
          </div>

          <Button
            type="button"
            onClick={() => void saveRule()}
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {ruleForm.ruleId ? 'Update rule' : 'Create rule'}
          </Button>
        </div>
      ) : null}

      {mutationError ? (
        <p className="text-sm text-destructive">{mutationError.message}</p>
      ) : null}

      {rulesQuery.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading rules…</p>
      ) : !rulesQuery.data?.length ? (
        <p className="text-xs text-muted-foreground">No rules — fallback response always used</p>
      ) : (
        <div className="space-y-2">
          {rulesQuery.data.map((rule, index) => (
            <div
              key={rule.id}
              className="flex items-start gap-2 rounded-md border p-3 text-sm bg-background"
            >
              <div className="flex flex-col gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={index === 0 || reorderMutation.isPending}
                  onClick={() => moveRule(index, -1)}
                >
                  <ChevronUp className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={index === rulesQuery.data!.length - 1 || reorderMutation.isPending}
                  onClick={() => moveRule(index, 1)}
                >
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <p className="font-medium">
                  {rule.name || `Rule ${index + 1}`}{' '}
                  <span className="text-muted-foreground font-normal">
                    → {rule.status_code}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {rule.match_mode === 'all' ? 'All' : 'Any'}:{' '}
                  {rule.conditions.map((c) => conditionSummary(c as ConditionForm)).join('; ')}
                </p>
              </div>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="icon" onClick={() => startEdit(rule)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteRuleId(rule.id)}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteRuleId !== null}
        onOpenChange={(open) => !open && setDeleteRuleId(null)}
        title="Delete rule?"
        description="This rule will be removed. The route fallback response will be used when no other rules match."
        confirmLabel="Delete rule"
        onConfirm={async () => {
          if (!deleteRuleId) return;
          await deleteMutation.mutateAsync({
            teamId,
            projectId,
            apiId,
            routeId,
            ruleId: deleteRuleId,
          });
        }}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
