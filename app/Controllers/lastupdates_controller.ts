import Lastupdate from "#models/lastupdate";
import { HttpContext } from "@adonisjs/core/http";
import { DateTime } from "luxon";

export default class LastUpdatesController {
  public async listAfterDate({ params, auth,response } : HttpContext ) {
    try {

        const user = await auth.getUserOrFail()

        const dateParam = params.date

        const parsedDate = DateTime.fromFormat(dateParam, 'yyyy-MM-ddHH:mm:ss')

        if (!parsedDate.isValid) {
            return response.badRequest({
                error: 'Formato de data inválido. Use o formato yyyy-MM-ddHH:mm:ss',
            })
        }

        const registros = await Lastupdate.query()
            .where('date_update', '>', parsedDate.toSQL())
            .where('user', user.id)
            .orderBy('date_update', 'asc')

        return response.json(registros)

    } catch (error) {
        return response.internalServerError({ error: 'Erro ao buscar registros'})
    }
  }
}