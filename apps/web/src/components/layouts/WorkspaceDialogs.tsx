'use client';

import type { EntryOperations } from '@/common/hooks/useEntryOperations';
import type { UploadQueue } from '@/common/hooks/useUploadQueue';
import Button from '@/components/common/Button';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import Icon from '@/components/common/Icon';
import Input from '@/components/common/Input';
import Modal from '@/components/common/Modal';

interface Props {
  ops: EntryOperations;
  uploads: UploadQueue;
}

/**
 * Every workspace dialog: duplicate uploads, new folder, rename, delete, bulk delete and root removal.
 **/
// Purely presentational — state and handlers live in useEntryOperations / useUploadQueue.
export default function WorkspaceDialogs({ ops, uploads }: Props) {
  return (
    <>
      <Modal
        open={uploads.duplicate !== null}
        onClose={() => uploads.resolveDuplicate('cancel')}
        title='Items already exist'>
        <div className='flex flex-col gap-y-5'>
          <p className='text-sm text-zinc-600 dark:text-zinc-400'>
            {uploads.duplicate?.length === 1
              ? 'An item with this name already exists here:'
              : `${uploads.duplicate?.length} items with these names already exist here:`}
          </p>
          <ul className='max-h-32 overflow-y-auto rounded-lg bg-zinc-100 p-3 text-xs dark:bg-zinc-900'>
            {uploads.duplicate?.map((name) => (
              <li key={name} className='truncate'>
                {name}
              </li>
            ))}
          </ul>
          <div className='flex flex-wrap justify-end gap-2'>
            <Button variant='soft-danger' onClick={() => uploads.resolveDuplicate('cancel')}>
              Cancel
            </Button>
            <Button variant='normal' onClick={() => uploads.resolveDuplicate('keep')}>
              Keep both
            </Button>
            <Button variant='primary' onClick={() => uploads.resolveDuplicate('replace')}>
              Replace
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={ops.newFolder.open} onClose={() => ops.newFolder.close()} title='New folder'>
        <form onSubmit={ops.newFolder.submit} className='flex flex-col gap-y-4'>
          <Input
            name='folderName'
            label='Folder name'
            value={ops.newFolder.name}
            onChange={(event) => ops.newFolder.setName(event.target.value)}
            autoFocus
          />
          <div className='flex justify-end gap-x-2'>
            <Button variant='soft-danger' onClick={() => ops.newFolder.close()}>
              Cancel
            </Button>
            <Button
              type='submit'
              variant='primary'
              loading={ops.newFolder.creating}
              disabled={!ops.newFolder.name.trim()}>
              Create
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={ops.rename.target !== null}
        onClose={() => {
          ops.rename.close();
          ops.rename.dismissExtWarning();
        }}
        title={ops.rename.target?.isFolder ? 'Rename folder' : 'Rename file'}>
        <form onSubmit={ops.rename.submit} className='flex flex-col gap-y-4'>
          <Input
            name='ops.rename.name'
            label='Name'
            value={ops.rename.name}
            onChange={(event) => ops.rename.setName(event.target.value)}
            autoFocus
          />
          <div className='flex justify-end gap-x-2'>
            <Button
              variant='soft-danger'
              onClick={() => {
                ops.rename.close();
                ops.rename.dismissExtWarning();
              }}>
              Cancel
            </Button>
            <Button
              type='submit'
              variant='primary'
              loading={ops.rename.renaming && ops.rename.extWarning === null}
              disabled={
                !ops.rename.name.trim() || ops.rename.name.trim() === ops.rename.target?.name
              }>
              Rename
            </Button>
          </div>
        </form>
      </Modal>

      {/* Extension-change confirmation (a modal on top of the rename modal) */}
      <Modal
        open={ops.rename.extWarning !== null}
        onClose={() => ops.rename.dismissExtWarning()}
        title='Change extension?'>
        <div className='flex flex-col gap-y-5'>
          <div className='flex gap-x-3'>
            <div className='inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-500'>
              <Icon icon='ExclamationTriangle' className='h-5 w-5' />
            </div>
            <p className='text-sm text-zinc-600 dark:text-zinc-400'>
              {ops.rename.extWarning?.toExt === ''
                ? `Removing the "${ops.rename.extWarning?.fromExt}" extension may change how this file opens.`
                : ops.rename.extWarning?.fromExt === ''
                  ? `Adding the "${ops.rename.extWarning?.toExt}" extension may change this file's type.`
                  : `Changing the extension from "${ops.rename.extWarning?.fromExt}" to "${ops.rename.extWarning?.toExt}" may change this file's type.`}
            </p>
          </div>
          <div className='flex flex-wrap justify-end gap-2'>
            <Button variant='soft-danger' onClick={() => ops.rename.dismissExtWarning()}>
              Cancel
            </Button>
            <Button
              variant='normal'
              loading={ops.rename.renaming && ops.rename.pending === ops.rename.extWarning?.keep}
              disabled={ops.rename.renaming}
              onClick={() =>
                ops.rename.extWarning && void ops.rename.run(ops.rename.extWarning.keep)
              }>
              {ops.rename.extWarning?.fromExt
                ? `Keep "${ops.rename.extWarning.fromExt}"`
                : 'Keep without extension'}
            </Button>
            <Button
              variant='primary'
              loading={ops.rename.renaming && ops.rename.pending === ops.rename.extWarning?.use}
              disabled={ops.rename.renaming}
              onClick={() =>
                ops.rename.extWarning && void ops.rename.run(ops.rename.extWarning.use)
              }>
              {ops.rename.extWarning?.toExt
                ? `Use "${ops.rename.extWarning.toExt}"`
                : 'Remove extension'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={ops.bulkRemove.open}
        onClose={() => ops.bulkRemove.close()}
        title='Delete items'
        message={`Delete the ${ops.bulkRemove.count} selected item${ops.bulkRemove.count === 1 ? '' : 's'}, including everything inside any selected folders? This cannot be undone.`}
        confirmLabel='Delete'
        loading={ops.bulkRemove.deleting}
        onConfirm={ops.bulkRemove.confirm}
      />

      <ConfirmDialog
        open={ops.remove.target !== null}
        onClose={() => ops.remove.cancel()}
        title={ops.remove.target?.isFolder ? 'Delete folder' : 'Delete file'}
        message={
          ops.remove.target?.isFolder
            ? `Delete the folder "${ops.remove.target?.name}" and everything inside it? This cannot be undone.`
            : `Delete the file "${ops.remove.target?.name}"? This cannot be undone.`
        }
        confirmLabel='Delete'
        loading={ops.remove.deleting}
        onConfirm={ops.remove.confirm}
      />

      <ConfirmDialog
        open={ops.unselectRoot.target !== null}
        onClose={() => ops.unselectRoot.cancel()}
        title='Remove folder'
        message={`Remove "${ops.unselectRoot.target?.name}" from the app? It stays in Google Drive — only its authorization here is revoked.`}
        confirmLabel='Remove'
        loading={ops.unselectRoot.busy}
        onConfirm={ops.unselectRoot.confirm}
      />
    </>
  );
}
