import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import { useConfirm } from './ConfirmDialog';

// The first suite in this repo that renders a component -- everything else
// here is pure logic or a source-text guard. It earns the exception because
// what it covers cannot be read off the source: a modal that closes when you
// click inside it, or one that cannot be closed at all, both look correct in
// a diff and both are dead ends in the hand.

function Harness({ onResult }) {
  const [confirm, dialog] = useConfirm();
  return (
    <>
      <button onClick={() => confirm('Throw the card away?').then(onResult)}>ask</button>
      {dialog}
    </>
  );
}

async function open(onResult) {
  const user = userEvent.setup();
  render(
    <I18nProvider initialLocale="en">
      <Harness onResult={onResult} />
    </I18nProvider>,
  );
  await user.click(screen.getByText('ask'));
  return user;
}

describe('useConfirm', () => {
  it('resolves true on the confirm button', async () => {
    const onResult = vi.fn();
    const user = await open(onResult);
    await user.click(screen.getByRole('button', { name: 'Start over' }));
    expect(onResult).toHaveBeenCalledWith(true);
  });

  it('resolves false on cancel', async () => {
    const onResult = vi.fn();
    const user = await open(onResult);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onResult).toHaveBeenCalledWith(false);
  });

  it('answers no on Escape, so the dialog is never a dead end', async () => {
    const onResult = vi.fn();
    const user = await open(onResult);
    await user.keyboard('{Escape}');
    expect(onResult).toHaveBeenCalledWith(false);
  });

  it('dismisses on the backdrop but not on the dialog itself', async () => {
    const onResult = vi.fn();
    const user = await open(onResult);

    // A click that lands on the dialog is a click *inside* the question, not
    // an answer to it. This is the half that regressed easily: the guard used
    // to be a `stopPropagation` handler on the dialog, and removing it would
    // make every click anywhere in the modal dismiss it.
    await user.click(screen.getByRole('alertdialog'));
    expect(onResult).not.toHaveBeenCalled();

    await user.click(document.querySelector('.confirm-backdrop'));
    expect(onResult).toHaveBeenCalledWith(false);
  });
});
