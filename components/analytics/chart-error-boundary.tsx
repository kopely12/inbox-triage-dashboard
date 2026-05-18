'use client';

import React from 'react';

interface Props {
  title?: string;
  children: React.ReactNode;
}
interface State { hasError: boolean; message: string }

export class ChartErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { hasError: true, message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-24 gap-1 text-center">
          <p className="text-xs font-medium text-muted-foreground">
            {this.props.title ?? 'Chart'} unavailable
          </p>
          <p className="text-[10px] text-muted-foreground/60 max-w-[220px] truncate">
            {this.state.message}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
