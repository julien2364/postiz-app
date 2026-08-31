'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useToaster } from '@gitroom/react/toaster/toaster';
import clsx from 'clsx';
import { FC, useCallback, useState } from 'react';

type CloudSource = 'google-drive' | 'dropbox' | 'canva' | 'media-bank';

const SOURCES: Array<{
  id: CloudSource;
  label: string;
  help: string;
}> = [
  {
    id: 'google-drive',
    label: 'Google Drive',
    help: 'Collez un lien de fichier partagé publiquement.',
  },
  {
    id: 'dropbox',
    label: 'Dropbox',
    help: 'Collez un lien de partage Dropbox.',
  },
  {
    id: 'canva',
    label: 'Canva',
    help: 'Collez un lien direct vers une image ou vidéo exportée.',
  },
  {
    id: 'media-bank',
    label: 'Banque de médias',
    help: 'Collez une URL HTTPS directe vers une image ou une vidéo.',
  },
];

const CloudImportForm: FC<{ onImported: () => void }> = ({ onImported }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const modals = useModals();
  const [source, setSource] = useState<CloudSource>('google-drive');
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const selected = SOURCES.find((item) => item.id === source)!;

  const importMedia = useCallback(async () => {
    if (!url.trim()) return;
    setLoading(true);
    try {
      const response = await fetch('/media/import-cloud-url', {
        method: 'POST',
        body: JSON.stringify({ source, url: url.trim(), name: name.trim() }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error?.message || 'Import impossible');
      }
      toaster.show('Média importé avec succès', 'success');
      onImported();
      modals.closeCurrent();
    } catch (error) {
      toaster.show(
        error instanceof Error ? error.message : 'Import impossible',
        'warning'
      );
    } finally {
      setLoading(false);
    }
  }, [fetch, modals, name, onImported, source, toaster, url]);

  return (
    <div className="flex flex-col gap-[16px] p-[4px]">
      <div className="grid grid-cols-2 gap-[8px] md:grid-cols-4">
        {SOURCES.map((item) => (
          <button
            type="button"
            key={item.id}
            onClick={() => setSource(item.id)}
            className={clsx(
              'rounded-[8px] border p-[12px] text-left text-[13px]',
              source === item.id
                ? 'border-[#612BD3] bg-boxFocused'
                : 'border-newTableBorder bg-newTableHeader'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="text-[13px] text-textColor/60">{selected.help}</div>
      <label className="flex flex-col gap-[5px] text-[13px]">
        Lien du média
        <input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://..."
          className="h-[44px] rounded-[8px] border border-newColColor bg-newBgColorInner px-[12px] outline-none focus:border-[#612BD3]"
        />
      </label>
      <label className="flex flex-col gap-[5px] text-[13px]">
        Nom dans Postiz (facultatif)
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="h-[44px] rounded-[8px] border border-newColColor bg-newBgColorInner px-[12px] outline-none focus:border-[#612BD3]"
        />
      </label>
      <div className="rounded-[8px] bg-newBgColorInner p-[10px] text-[12px] text-textColor/60">
        Le fichier est copié dans la médiathèque Postiz. La source cloud n’est
        jamais modifiée.
      </div>
      <button
        type="button"
        disabled={!url.trim() || loading}
        onClick={importMedia}
        className="h-[44px] rounded-[8px] bg-[#612BD3] px-[16px] text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Import en cours…' : `Importer depuis ${selected.label}`}
      </button>
    </div>
  );
};

export const CloudMediaImport: FC<{ onImported: () => void }> = ({
  onImported,
}) => {
  const modals = useModals();
  return (
    <button
      type="button"
      onClick={() =>
        modals.openModal({
          title: 'Importer depuis le cloud',
          withCloseButton: true,
          children: <CloudImportForm onImported={onImported} />,
        })
      }
      className="h-[44px] rounded-[8px] bg-btnSimple px-[14px] text-[13px]"
    >
      Drive / Dropbox / Canva
    </button>
  );
};
