import {
  getDocument,
  getSections,
} from "./legal.repository";

export async function loadMasterServiceAgreement(){

  const document=await getDocument("MASTER_SERVICE_AGREEMENT");

  const sections=await getSections(document.id);

  return{
    document,
    sections
  };

}
