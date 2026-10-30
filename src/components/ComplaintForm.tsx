import { useEffect, useState } from 'react';
import { saveComplaint } from '../db/complaints';
import { BODY_ZONES, SIDES, type Complaint, type ComplaintKind, type Player, type Side } from '../db/types';
import { todayISO } from '../lib/format';
import { Modal } from './Modal';
import { useToast } from './Toast';
import { Button, Field, Input, Segmented, Select, Textarea, cx } from './ui';

export function ComplaintForm({
  open,
  onClose,
  player,
  sessionId,
  complaint,
}: {
  open: boolean;
  onClose: () => void;
  player: Player | undefined;
  sessionId?: number;
  complaint?: Complaint;
}) {
  const toast = useToast();
  const [kind, setKind] = useState<ComplaintKind>('molestia');
  const [zone, setZone] = useState(BODY_ZONES[0]);
  const [side, setSide] = useState<Side>('derecha');
  const [intensity, setIntensity] = useState(3);
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState('');
  const [physioNotes, setPhysioNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setKind(complaint?.kind ?? 'molestia');
    setZone(complaint?.zone ?? BODY_ZONES[0]);
    setSide(complaint?.side ?? 'derecha');
    setIntensity(complaint?.intensity ?? 3);
    setDate(complaint?.date ?? todayISO());
    setDescription(complaint?.description ?? '');
    setPhysioNotes(complaint?.physioNotes ?? '');
  }, [open, complaint]);

  if (!player) return null;

  const save = async () => {
    await saveComplaint({
      ...(complaint ?? { createdAt: Date.now(), sessionId }),
      playerId: player.id!,
      kind,
      zone,
      side,
      intensity,
      date,
      description,
      physioNotes,
    });
    toast(kind === 'lesion' ? 'Lesión registrada' : 'Molestia registrada', 'success');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${complaint ? 'Editar' : 'Registrar'} molestia · ${player.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save}>Guardar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'molestia', label: 'Molestia' },
            { value: 'lesion', label: 'Lesión', activeClass: 'bg-red-600 text-white shadow-sm' },
          ]}
        />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Zona">
            <Select value={zone} onChange={(e) => setZone(e.target.value)}>
              {BODY_ZONES.map((z) => (
                <option key={z}>{z}</option>
              ))}
            </Select>
          </Field>
          <Field label="Lado">
            <Select value={side} onChange={(e) => setSide(e.target.value as Side)}>
              {SIDES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">Intensidad del dolor: {intensity}/10</p>
          <div className="grid grid-cols-11 gap-1">
            {Array.from({ length: 11 }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIntensity(i)}
                className={cx(
                  'h-10 rounded-lg text-sm font-bold',
                  intensity === i
                    ? i >= 7
                      ? 'bg-red-600 text-white'
                      : i >= 4
                        ? 'bg-amber-400 text-amber-950'
                        : 'bg-emerald-500 text-white'
                    : 'bg-slate-100 text-slate-600',
                )}
              >
                {i}
              </button>
            ))}
          </div>
        </div>
        <Field label="Fecha">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Descripción">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="¿Cuándo aparece? ¿En qué gesto?" />
        </Field>
        <Field label="Notas del fisio">
          <Textarea rows={2} value={physioNotes} onChange={(e) => setPhysioNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
