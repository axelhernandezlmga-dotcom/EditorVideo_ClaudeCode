import { AlertTriangle, ArrowLeft, RotateCcw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Si una pantalla se rompe (un dato que no esperaba, un error de código), muestra un cartel con el error y
 * botones para volver o reintentar, en vez de dejar la pantalla negra. Se reinicia al cambiar de ruta (`ruta`).
 */
export class ErrorPantalla extends Component<{ ruta: string; children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`La pantalla ${this.props.ruta} se rompió:`, error, info.componentStack);
  }

  override componentDidUpdate(previas: { ruta: string }) {
    if (previas.ruta !== this.props.ruta && this.state.error) this.setState({ error: null });
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <section className="tarjeta error-pantalla" role="alert">
        <h2>
          <AlertTriangle size={22} style={{ verticalAlign: "-4px", color: "var(--error)" }} /> Esta pantalla tuvo un problema
        </h2>
        <p className="ayuda">El resto de la app sigue andando. Si se repite, pasale este mensaje a Claude:</p>
        <pre className="mono">{error.message}</pre>
        <div className="fila" style={{ gap: 8 }}>
          <button className="boton primario" onClick={() => (window.history.length > 1 ? window.history.back() : (window.location.hash = "/"))}>
            <ArrowLeft size={16} /> Volver
          </button>
          <button className="boton" onClick={() => this.setState({ error: null })}>
            <RotateCcw size={16} /> Reintentar
          </button>
        </div>
      </section>
    );
  }
}
