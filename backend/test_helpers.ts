import axios from "axios";

interface ResponseType {
    success: boolean,
    message: string
}

const checkEligibility = async (creator: string, img_path: string): Promise<ResponseType | null> => {
    let metadata = {
      "filename": "elonshoecooks",
      "owner": creator,
      "desc": "Elon shoe cooking some supper"
    }

    const uploadLocalFile = async () => {
      
      const file = Bun.file(img_path);

      const formData = new FormData();
      formData.append('metadata', JSON.stringify(metadata));
      formData.append('file', file); // Bun.file returns a Blob-compatible object
      let response;
      let response_data: ResponseType | null;
      try {
        response = await axios.post(
          'https://chihuahua77-espresso.hf.space/eligibiltyCheck', 
          formData
        );
        console.log('Success:', response.data);
        response_data = response.data;
      } catch (error) {
        console.error(`Upload failed: ${error}`);
        response_data = null
      }
      return response_data;
    };

    return await uploadLocalFile()
}

export default checkEligibility;

