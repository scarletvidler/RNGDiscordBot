import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => {
  return [
    { title: "RNG Members" },
    { name: "description", content: "RNG Members Area" },
  ];
};


export default function Members() {
    return (
        <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-16">
            <header className="flex flex-col items-center gap-9">
            <h1 className="leading text-2xl font-bold text-gray-800 dark:text-gray-100">
                Welcome to RNG Members Area
            </h1>
            <div className="h-[144px] w-[434px] text-center">
                Who knows what will be here?
            </div>
            </header>
        </div>
        </div>
    );
}
