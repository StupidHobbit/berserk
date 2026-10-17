#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D u_card;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_seed;
uniform bool u_is_foil;
varying vec2 v_uv;

float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.2,1.0,length((p-c)/r));
}

void main() {
    vec4 scan=texture2D(u_card,v_uv);
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    float aa=max(1.0/max(u_resolution.x,1.0),1.4113/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.173)*6.2831853;
    // The lower skeleton, shields, caption and title are entirely outside.
    float art=smoothstep(0.140,0.157,p.y)*(1.0-smoothstep(0.527,0.541,p.y));
    art*=smoothstep(0.009,0.028,p.x)*(1.0-smoothstep(0.974,0.991,p.x));
    if (art<=0.0) { gl_FragColor=scan; return; }
    vec3 color=scan.rgb;

    // Three slum alleys breathe curling infected smoke into the painted fog.
    // Packets travel up/right instead of merely pulsing their opacity.
    float smoke=0.0;
    float edge=0.0;
    for (int i=0;i<3;i++) {
        float fi=float(i);
        vec2 source=vec2(0.22+fi*0.135,0.495-fi*0.036);
        float progress=clamp((p.x-source.x)/0.52,0.0,1.0);
        float axis=source.y-progress*(0.17+fi*0.018);
        axis+=sin(progress*12.0-t*1.30+seed+fi*1.7)*(0.008+progress*0.020);
        float width=0.008+progress*0.030;
        float envelope=smoothstep(source.x,source.x+0.035,p.x)
                      *(1.0-smoothstep(source.x+0.36,source.x+0.55,p.x));
        float d=(p.y-axis)/width;
        float moving=0.5+0.5*sin(progress*21.0-t*2.4+fi*2.2+seed);
        float body=exp(-d*d)*envelope*(0.25+0.75*moving);
        smoke+=body;
        edge+=exp(-pow((p.y-axis-width*0.48)/(0.0025+aa*0.5),2.0))
             *envelope*moving*0.40;
    }
    smoke=min(smoke,1.35);
    color*=1.0-smoke*0.32;
    color+=(1.0-color)*vec3(0.34,0.41,0.065)*smoke*0.46;
    color+=vec3(0.17,0.23,0.035)*edge;

    // Rising spores break the smooth fog into visible moving flecks.
    float spores=0.0;
    float tails=0.0;
    for (int j=0;j<15;j++) {
        float fj=float(j);
        float h=fract(sin(fj*53.7+seed)*163.51);
        float age=fract(t*(0.13+h*0.06)+fj*0.137+seed*0.07);
        vec2 c=vec2(0.24+h*0.34+age*0.29,0.515-age*(0.20+h*0.13));
        c.x+=sin(age*11.0+fj*2.1)*0.019;
        vec2 q=(p-c)*vec2(1.0,1.4113);
        float fade=sin(age*3.14159265);
        spores+=(1.0-smoothstep(0.0015,0.0035+aa*0.7,length(q)))*fade;
        tails+=exp(-pow(q.x/0.004,2.0)-pow((q.y-0.011)/0.015,2.0))*fade*0.25;
    }
    color+=vec3(0.49,0.53,0.10)*spores*0.72;
    color+=vec3(0.19,0.26,0.04)*tails;

    // Warm inhabited windows sputter beneath the sickly exterior haze.
    float windows=0.0;
    windows+=oval(p,vec2(0.229,0.498),vec2(0.009,0.013));
    windows+=oval(p,vec2(0.247,0.429),vec2(0.011,0.015));
    windows+=oval(p,vec2(0.346,0.349),vec2(0.011,0.014));
    windows+=oval(p,vec2(0.184,0.245),vec2(0.012,0.012));
    windows+=oval(p,vec2(0.064,0.178),vec2(0.009,0.014));
    float flicker=0.45+0.30*sin(t*3.1+p.y*91.0+seed)+0.15*sin(t*7.3+p.x*121.0);
    color+=vec3(0.61,0.27,0.035)*windows*flicker;

    if (u_is_foil) {
        // Oxidized copper roofs and an oil-slick foil fog; always visible at t=0.
        float luminance=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
        float roof=smoothstep(0.015,0.12,scan.r-scan.b)
                  *(1.0-smoothstep(0.46,0.62,p.x));
        float phase=p.x*2.4+p.y*3.6-t*0.12+seed*0.09;
        vec3 spectrum=0.5+0.5*cos(6.2831853*(phase+vec3(0.02,0.35,0.68)));
        vec3 overlay=mix(2.0*color*spectrum,
                         1.0-2.0*(1.0-color)*(1.0-spectrum),step(vec3(0.5),color));
        color=mix(color,overlay,0.36);
        float band=pow(0.5+0.5*sin(phase*6.2831853),14.0);
        float etched=0.7+0.3*sin(p.x*155.0-p.y*112.0+sin(p.y*39.0));
        float metal=smoothstep(0.09,0.44,luminance)*(0.25+roof*0.75);
        color*=1.0-metal*0.16;
        color+=(1.0-color)*mix(vec3(0.75,0.44,0.12),spectrum,0.57)
              *metal*(0.18+band*0.70)*etched;
        color+=spectrum*spores*0.12;
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
