import React, { useMemo, useState } from 'react';
import { Bell, Plus, Trash2 } from 'lucide-react';
import Layout from '../components/layout/Layout';
import AlertsPanel from '../components/dashboard/AlertsPanel';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { useAnalyticsContext } from '../context/AnalyticsContext';

export default function AlertsPage() {
  const {
    alerts,
    dismissAlert,
    alertRules,
    alertMetricOptions,
    alertOperatorOptions,
    alertChannelOptions,
    createAlertRule,
    removeAlertRule,
  } = useAnalyticsContext();

  const [form, setForm] = useState({
    metric: alertMetricOptions[0]?.value || 'error_rate',
    operator: alertOperatorOptions[0]?.value || 'greater_than',
    threshold: '',
    channel: alertChannelOptions[0] || 'Email',
  });
  const [formMessage, setFormMessage] = useState('');
  const [formError, setFormError] = useState('');

  const metricLabelMap = useMemo(
    () => Object.fromEntries(alertMetricOptions.map((item) => [item.value, item.label])),
    [alertMetricOptions]
  );

  const operatorLabelMap = useMemo(
    () => Object.fromEntries(alertOperatorOptions.map((item) => [item.value, item.label])),
    [alertOperatorOptions]
  );

  const handleCreateRule = (e) => {
    e.preventDefault();
    setFormMessage('');
    setFormError('');

    if (String(form.threshold).trim() === '') {
      setFormError('Enter a threshold value.');
      return;
    }

    const threshold = Number(form.threshold);
    if (!Number.isFinite(threshold)) {
      setFormError('Enter a valid threshold value.');
      return;
    }

    createAlertRule({
      metric: form.metric,
      operator: form.operator,
      threshold,
      channel: form.channel,
    });

    setForm((prev) => ({ ...prev, threshold: '' }));
    setFormMessage('Alert rule created successfully.');
  };

  return (
    <Layout title="Alerts" subtitle="Threshold monitoring and notifications">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <AlertsPanel alerts={alerts} onDismiss={dismissAlert} />
        </div>

        <div className="space-y-3">
          <Card glow>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bell size={14} className="text-accent-cyan" />
                <CardTitle>Create Alert Rule</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateRule} className="space-y-3">
                <div>
                  <label className="text-[10px] font-mono text-text-muted block mb-1">METRIC</label>
                  <select
                    value={form.metric}
                    onChange={(e) => setForm((prev) => ({ ...prev, metric: e.target.value }))}
                    className="w-full bg-bg-elevated border border-bg-border rounded-lg px-3 py-1.5 text-xs text-text-secondary focus:outline-none focus:border-accent-cyan/40"
                  >
                    {alertMetricOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-mono text-text-muted block mb-1">CONDITION</label>
                  <select
                    value={form.operator}
                    onChange={(e) => setForm((prev) => ({ ...prev, operator: e.target.value }))}
                    className="w-full bg-bg-elevated border border-bg-border rounded-lg px-3 py-1.5 text-xs text-text-secondary focus:outline-none focus:border-accent-cyan/40"
                  >
                    {alertOperatorOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-mono text-text-muted block mb-1">THRESHOLD</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.threshold}
                    onChange={(e) => setForm((prev) => ({ ...prev, threshold: e.target.value }))}
                    placeholder="e.g. 5"
                    className="w-full bg-bg-elevated border border-bg-border rounded-lg px-3 py-1.5 text-xs text-text-secondary placeholder-text-muted focus:outline-none focus:border-accent-cyan/40"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-mono text-text-muted block mb-1">NOTIFY VIA</label>
                  <div className="flex gap-2">
                    {alertChannelOptions.map((channel) => (
                      <button
                        key={channel}
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, channel }))}
                        className={`flex-1 py-1.5 text-[10px] font-mono border rounded-lg transition-all ${
                          form.channel === channel
                            ? 'border-accent-cyan/40 bg-accent-cyan/10 text-accent-cyan'
                            : 'border-bg-border text-text-muted hover:border-accent-cyan/30 hover:text-accent-cyan'
                        }`}
                      >
                        {channel}
                      </button>
                    ))}
                  </div>
                </div>

                {formError && (
                  <div className="rounded-lg border border-accent-red/20 bg-accent-red/10 px-3 py-2 text-xs text-accent-red">
                    {formError}
                  </div>
                )}

                {formMessage && (
                  <div className="rounded-lg border border-accent-green/20 bg-accent-green/10 px-3 py-2 text-xs text-accent-green">
                    {formMessage}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-accent-cyan/10 border border-accent-cyan/20 text-accent-cyan text-xs font-500 hover:bg-accent-cyan/20 transition-all"
                >
                  <Plus size={12} />
                  Create Alert Rule
                </button>
              </form>
            </CardContent>
          </Card>

          <Card glow>
            <CardHeader>
              <CardTitle>Saved Rules</CardTitle>
              <span className="text-xs font-mono text-text-muted">{alertRules.length} total</span>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {alertRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="rounded-lg border border-bg-border bg-bg-elevated/60 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-text-primary">
                          {metricLabelMap[rule.metric] || rule.metric} {operatorLabelMap[rule.operator] || rule.operator}{' '}
                          {rule.threshold}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="cyan">{rule.channel}</Badge>
                          <span className="text-[10px] text-text-muted font-mono">{rule.id}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAlertRule(rule.id)}
                        className="p-1.5 rounded-md border border-bg-border text-text-muted hover:text-accent-red hover:border-accent-red/30 transition-colors"
                        title="Delete alert rule"
                        aria-label="Delete alert rule"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
