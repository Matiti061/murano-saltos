import { useEffect, useState } from 'react';
import { savePlayer } from '../db/players';
import { PLAYER_STATUS_LABEL, POSITIONS, type Player, type PlayerStatus, type Position } from '../db/types';
import { Modal } from './Modal';
import { useToast } from './Toast';
import { Button, Field, Input, Select, Textarea } from './ui';

export function PlayerForm({
  open,
  onClose,
  teamId,
  player,
}: {
  open: boolean;
  onClose: () => void;
  teamId: number;
  player?: Player;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [position, setPosition] = useState<Position>('Punta receptora');
  const [status, setStatus] = useState<PlayerStatus>('activa');
  const [limit, setLimit] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(player?.name ?? '');
    setPosition(player?.position ?? 'Punta receptora');
    setStatus(player?.status ?? 'activa');
    setLimit(player?.jumpLimit != null ? String(player.jumpLimit) : '');
    setNotes(player?.notes ?? '');
  }, [open, player]);

  const save = async () => {
    if (!name.trim()) return toast('Escribe el nombre de la jugadora', 'warning');
    await savePlayer({
      ...(player ?? { archived: 0, createdAt: Date.now() }),
      teamId: player?.teamId ?? teamId,
      name,
      position,
      status,
      jumpLimit: limit === '' ? undefined : Number(limit),
      notes: notes.trim() || undefined,
    });
    toast(player ? 'Jugadora actualizada' : 'Jugadora añadida', 'success');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={player ? 'Editar jugadora' : 'Nueva jugadora'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save}>Guardar</Button>
        </>
      }
    >
      <form
        className="grid grid-cols-2 gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="col-span-2">
          <Field label="Nombre">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Nombre y apellido" />
          </Field>
        </div>
        <Field label="Posición">
          <Select value={position} onChange={(e) => setPosition(e.target.value as Position)}>
            {POSITIONS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </Field>
        <Field label="Estado">
          <Select value={status} onChange={(e) => setStatus(e.target.value as PlayerStatus)}>
            {Object.entries(PLAYER_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <div className="col-span-2 sm:col-span-1">
          <Field label="Límite de saltos por sesión" hint="Opcional. Útil en readaptación: avisa al acercarse.">
            <Input type="number" inputMode="numeric" min={0} value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="Sin límite" />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="Notas">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Historial de lesiones, indicaciones del fisio…" />
          </Field>
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
