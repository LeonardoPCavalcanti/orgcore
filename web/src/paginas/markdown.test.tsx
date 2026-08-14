import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Markdown } from './markdown';

describe('Markdown', () => {
  it('renderiza negrito de **texto**', () => {
    render(<Markdown texto="Isso é **importante** mesmo" />);
    const forte = screen.getByText('importante');
    expect(forte.tagName).toBe('STRONG');
  });

  it('agrupa linhas de bullet numa lista', () => {
    render(<Markdown texto={'Itens:\n* um\n* dois'} />);
    const itens = screen.getAllByRole('listitem');
    expect(itens.map((i) => i.textContent)).toEqual(['um', 'dois']);
  });

  it('renderiza codigo inline com crase', () => {
    render(<Markdown texto="use `npm install` aqui" />);
    expect(screen.getByText('npm install').tagName).toBe('CODE');
  });
});
