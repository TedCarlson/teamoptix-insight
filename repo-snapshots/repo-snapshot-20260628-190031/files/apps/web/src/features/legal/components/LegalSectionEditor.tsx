"use client";

import { useState } from "react";

export default function LegalSectionEditor(props:{
  initialValue:string;
}){

  const [value,setValue]=useState(props.initialValue);

  return(

    <textarea
      value={value}
      onChange={(e)=>setValue(e.target.value)}
      style={{
        width:"100%",
        minHeight:420,
        resize:"vertical",
        border:"none",
        outline:"none",
        font:"inherit",
        lineHeight:1.8,
        background:"transparent"
      }}
    />

  );

}
