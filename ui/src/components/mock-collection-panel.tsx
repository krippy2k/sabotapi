import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Database, Trash2 } from 'lucide-react';

type PendingConfirm = { type: 'delete' | 'reset'; collectionId: string; name: string } | null;

type MockCollectionPanelProps = {
  teamId: string;
  projectId: string;
};

export function MockCollectionPanel({ teamId, projectId }: MockCollectionPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [idField, setIdField] = useState('id');
  const [initialData, setInitialData] = useState('[]');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);

  const utils = trpc.useUtils();

  const collectionsQuery = trpc.mockApi.collections.list.useQuery({ teamId, projectId });

  const createMutation = trpc.mockApi.collections.create.useMutation({
    onSuccess: () => {
      void utils.mockApi.collections.list.invalidate({ teamId, projectId });
      setShowForm(false);
      setName('');
      setIdField('id');
      setInitialData('[]');
    },
  });

  const deleteMutation = trpc.mockApi.collections.delete.useMutation({
    onSuccess: () => {
      void utils.mockApi.collections.list.invalidate({ teamId, projectId });
      setPendingConfirm(null);
      setExpandedId(null);
    },
  });

  const resetMutation = trpc.mockApi.collections.reset.useMutation({
    onSuccess: () => {
      void utils.mockApi.collections.snapshot.invalidate();
      setPendingConfirm(null);
    },
  });

  const handleConfirm = async () => {
    if (!pendingConfirm) return;
    if (pendingConfirm.type === 'delete') {
      await deleteMutation.mutateAsync({
        teamId,
        projectId,
        collectionId: pendingConfirm.collectionId,
      });
    } else {
      await resetMutation.mutateAsync({
        teamId,
        projectId,
        collectionId: pendingConfirm.collectionId,
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium flex items-center gap-2">
            <Database className="w-4 h-4" />
            Data collections
          </p>
          <p className="text-xs text-muted-foreground">
            Stateful mock storage — shared across routes in this project
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : 'New collection'}
        </Button>
      </div>

      {showForm ? (
        <div className="space-y-3 rounded-md border p-4">
          <div className="space-y-2">
            <Label htmlFor="collectionName">Name</Label>
            <Input
              id="collectionName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="users"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="idField">ID field</Label>
            <Input
              id="idField"
              value={idField}
              onChange={(e) => setIdField(e.target.value)}
              placeholder="id"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="initialData">Initial data (JSON array)</Label>
            <textarea
              id="initialData"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              value={initialData}
              onChange={(e) => setInitialData(e.target.value)}
            />
          </div>
          <Button
            onClick={() =>
              void createMutation.mutateAsync({
                teamId,
                projectId,
                name,
                idField,
                initialData,
              })
            }
            disabled={!name.trim() || createMutation.isPending}
          >
            Create collection
          </Button>
          {createMutation.isError ? (
            <p className="text-sm text-destructive">{createMutation.error.message}</p>
          ) : null}
        </div>
      ) : null}

      {collectionsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading collections…</p>
      ) : !collectionsQuery.data?.length ? (
        <p className="text-sm text-muted-foreground">No collections yet</p>
      ) : (
        <div className="space-y-2">
          {collectionsQuery.data.map((collection) => (
            <CollectionRow
              key={collection.id}
              teamId={teamId}
              projectId={projectId}
              collection={collection}
              expanded={expandedId === collection.id}
              onToggle={() =>
                setExpandedId((id) => (id === collection.id ? null : collection.id))
              }
              onDelete={() =>
                setPendingConfirm({
                  type: 'delete',
                  collectionId: collection.id,
                  name: collection.name,
                })
              }
              onReset={() =>
                setPendingConfirm({
                  type: 'reset',
                  collectionId: collection.id,
                  name: collection.name,
                })
              }
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingConfirm !== null}
        onOpenChange={(open) => !open && setPendingConfirm(null)}
        title={pendingConfirm?.type === 'delete' ? 'Delete collection?' : 'Reset collection?'}
        description={
          pendingConfirm?.type === 'delete'
            ? `Delete "${pendingConfirm.name}" and wipe its runtime data file? Routes using this collection will stop working.`
            : `Reset "${pendingConfirm?.name}" to its configured initial data?`
        }
        confirmLabel={pendingConfirm?.type === 'delete' ? 'Delete' : 'Reset'}
        onConfirm={handleConfirm}
        loading={deleteMutation.isPending || resetMutation.isPending}
      />
    </div>
  );
}

function CollectionRow({
  teamId,
  projectId,
  collection,
  expanded,
  onToggle,
  onDelete,
  onReset,
}: {
  teamId: string;
  projectId: string;
  collection: { id: string; name: string; id_field: string };
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onReset: () => void;
}) {
  const snapshotQuery = trpc.mockApi.collections.snapshot.useQuery(
    { teamId, projectId, collectionId: collection.id },
    { enabled: expanded }
  );

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onToggle} className="text-left flex-1 min-w-0">
          <p className="font-medium text-sm">{collection.name}</p>
          <p className="text-xs text-muted-foreground">id field: {collection.id_field}</p>
        </button>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={onReset}>
            Reset
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      </div>
      {expanded ? (
        <div className="mt-3 space-y-1">
          <p className="text-xs text-muted-foreground">
            {snapshotQuery.isLoading
              ? 'Loading…'
              : `${snapshotQuery.data?.count ?? 0} item(s) in runtime store`}
          </p>
          {snapshotQuery.data ? (
            <pre className="text-xs rounded-md border bg-muted/50 p-2 overflow-x-auto font-mono max-h-48">
              {JSON.stringify(snapshotQuery.data.items, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
