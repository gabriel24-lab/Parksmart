-- Script para crear la tabla Personas si no existe
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Personas]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[Personas] (
        [numero_documento] VARCHAR(50) NOT NULL PRIMARY KEY,
        [tipo_documento] VARCHAR(20) NULL,
        [nombres] VARCHAR(100) NOT NULL,
        [apellidos] VARCHAR(100) NOT NULL,
        [celular] VARCHAR(20) NULL,
        [correo] VARCHAR(100) NULL,
        [estado_formacion] VARCHAR(50) NULL
    );
END
GO
