import Link from "next/link";

export default function NoEncontrado() {
  return (
    <>
      <h1>No encontramos esa obra</h1>
      <p>Puede que el número sea incorrecto o que la obra todavía no esté indexada.</p>
      <p>
        <Link href="/">Volver al tablero de obras</Link>
      </p>
    </>
  );
}
