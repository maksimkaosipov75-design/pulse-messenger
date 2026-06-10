import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useToastStore, toast } from './toastStore';

describe('toastStore', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
    vi.useFakeTimers();
  });

  it('shows and auto-dismisses a toast', () => {
    toast.error('boom');
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'error', message: 'boom' });

    vi.advanceTimersByTime(5001);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('collapses duplicate messages', () => {
    toast.error('same');
    toast.error('same');
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it('keeps different types separate', () => {
    toast.error('msg');
    toast.info('msg');
    expect(useToastStore.getState().toasts).toHaveLength(2);
  });

  it('dismisses by id', () => {
    toast.success('done');
    const id = useToastStore.getState().toasts[0].id;
    useToastStore.getState().dismiss(id);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});
