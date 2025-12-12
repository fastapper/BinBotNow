import { Component, ReactNode } from 'react';

type Props = { children: ReactNode }
type State = { hasError: boolean; err?: any }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }
  static getDerivedStateFromError(err:any){ return { hasError: true, err } }
  componentDidCatch(error:any, info:any){ console.error('ErrorBoundary', error, info) }
  render(){
    if (this.state.hasError){
      return (
        <div style={{padding:20}}>
          <h3 style={{color:'#f87171'}}>UI error</h3>
          <pre style={{whiteSpace:'pre-wrap', color:'#fca5a5'}}>{String(this.state.err||'')}</pre>
        </div>
      )
    }
    return this.props.children
  }
}
