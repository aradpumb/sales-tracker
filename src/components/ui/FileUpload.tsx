"use client";

import React from "react";
import Papa, { ParseResult } from "papaparse";

type FileUploadProps = {
  label?: string;
  onParsed: (rows: Record<string, any>[]) => void;
  accept?: string;
  className?: string;
};

export default function FileUpload({
  label = "Upload CSV",
  onParsed,
  accept = ".csv",
  className,
}: FileUploadProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete(results: ParseResult<Record<string, any>>) {
        onParsed(results.data);
        if (inputRef.current) inputRef.current.value = "";
      },
    });
  }

  return (
    <div className={className}>
      <label className="btn btn-secondary cursor-pointer">
        {label}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleChange}
          className="hidden"
        />
      </label>
    </div>
  );
}
