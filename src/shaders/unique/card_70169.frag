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

float oval(vec2 p,vec2 c,vec2 r) {
    return 1.0-smoothstep(0.25,1.0,length((p-c)/r));
}
float segment(vec2 p,vec2 a,vec2 b) {
    vec2 v=b-a;
    return length(p-a-v*clamp(dot(p-a,v)/max(dot(v,v),0.000001),0.0,1.0));
}
// Perspective follows the painted dragon's lower-right rib cage.
vec2 netPoint(vec2 uv) {
    return mix(mix(vec2(0.650,0.397),vec2(0.950,0.435),uv.x),
               mix(vec2(0.625,0.516),vec2(0.916,0.552),uv.x),uv.y);
}
vec2 tether(float f,float t) {
    return mix(vec2(0.326,0.294),vec2(0.650,0.397),f)
        +vec2(0.0,-0.082*sin(f*3.141593)+0.003*sin(f*18.0-t*2.1)*sin(f*3.141593));
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 source=texture2D(u_card,v_uv);
    vec3 col=source.rgb;
    float aa=max(1.0/max(u_resolution.x,1.0),1.0/max(u_resolution.y,1.0));
    float seed=fract(u_seed*0.137);
    float t=u_time+seed*3.7;
    float art=smoothstep(0.139,0.149,p.y)*(1.0-smoothstep(0.553,0.565,p.y));
    art*=smoothstep(0.006,0.018,p.x)*(1.0-smoothstep(0.980,0.992,p.x));
    // The shield is printed card information, not part of the illustration.
    art*=smoothstep(1.0,1.13,length((p-vec2(0.110,0.180))/vec2(0.060,0.040)));
    float face=oval(p,vec2(0.453,0.177),vec2(0.041,0.033));
    float person=oval(p,vec2(0.458,0.371),vec2(0.181,0.219));
    float lum=dot(source.rgb,vec3(0.2126,0.7152,0.0722));

    // A warm resurrection pulse moves along the existing orange bone paint.
    float bone=smoothstep(0.055,0.25,source.r-source.b)
              *smoothstep(0.07,0.25,source.g-source.b)
              *smoothstep(0.19,0.46,lum)*(1.0-person*0.94);
    float wave=pow(0.5+0.5*sin(p.x*20.0+p.y*31.0-t*2.1),5.0);
    col+=(1.0-col)*vec3(1.0,0.49,0.075)*bone*(0.16+0.49*wave);
    float eye=oval(p,vec2(0.802,0.243),vec2(0.017,0.009));
    float eyeHalo=oval(p,vec2(0.802,0.243),vec2(0.048,0.026));
    float breath=0.64+0.36*sin(t*2.1);
    col+=vec3(1.0,0.56,0.09)*(eye*0.65+eyeHalo*0.13)*breath;

    // The staff's two skulls light the curse before it travels into the net.
    float skull=oval(p,vec2(0.283,0.309),vec2(0.029,0.022))
               +oval(p,vec2(0.331,0.285),vec2(0.030,0.023));
    float skullEyes=oval(p,vec2(0.277,0.301),vec2(0.008,0.005))
                  +oval(p,vec2(0.289,0.303),vec2(0.007,0.005))
                  +oval(p,vec2(0.322,0.291),vec2(0.007,0.005))
                  +oval(p,vec2(0.343,0.294),vec2(0.007,0.005));
    col+=(1.0-col)*vec3(0.62,0.30,1.0)*skull*(0.24+0.23*breath);
    col+=vec3(0.69,0.89,1.0)*skullEyes*(0.50+0.45*breath);
    float thread=0.0;
    float threadGlow=0.0;
    for(int i=0;i<24;i++) {
        float f=float(i)/24.0;
        float d=segment(p,tether(f,t),tether(f+1.0/24.0,t));
        float charge=0.28+0.72*pow(0.5+0.5*cos(f*13.0-t*2.8),8.0);
        thread=max(thread,(1.0-smoothstep(0.0008,0.0022+aa*0.5,d))*charge);
        threadGlow=max(threadGlow,exp(-d*d/0.00013)*charge);
    }
    // Let the tether pass behind the adept's torso, retaining his silhouette.
    float occlusion=1.0-person*0.90;
    col+=vec3(0.38,0.24,0.72)*(thread*0.65+threadGlow*0.20)*occlusion;

    // Three horizontal and three vertical threads make exactly four cells:
    // the 2x2 square selected by the card's astral-network rule.
    float web=0.0;
    float webGlow=0.0;
    for(int i=0;i<3;i++) {
        float f=float(i)*0.5;
        float dh=segment(p,netPoint(vec2(0.0,f)),netPoint(vec2(1.0,f)));
        float dv=segment(p,netPoint(vec2(f,0.0)),netPoint(vec2(f,1.0)));
        float d=min(dh,dv);
        float flow=0.58+0.42*sin(p.x*31.0-p.y*22.0-t*2.7+f*3.0);
        web=max(web,(1.0-smoothstep(0.0008,0.0024+aa*0.5,d))*flow);
        webGlow=max(webGlow,exp(-d*d/0.00010)*flow);
    }
    float sigils=0.0;
    float aura=0.0;
    for(int i=0;i<4;i++) {
        float fi=float(i);
        vec2 cell=vec2(mod(fi,2.0),floor(fi*0.5));
        vec2 center=netPoint(vec2(0.25)+cell*0.5);
        vec2 q=(p-center)*vec2(1.0,1.4113);
        float diamond=abs(q.x)+abs(q.y);
        float radius=0.013+0.003*sin(t*1.6-fi*1.57);
        float edge=abs(diamond-radius);
        float pulse=0.48+0.52*pow(0.5+0.5*sin(t*2.1-fi*1.57),3.0);
        sigils+=(1.0-smoothstep(0.0010,0.0026+aa,edge))*pulse;
        aura+=exp(-dot(q,q)/0.0008)*pulse;
    }
    col+=(1.0-col)*vec3(0.48,0.30,0.95)*(web*0.64+webGlow*0.22+aura*0.17);
    col+=vec3(0.48,0.82,1.0)*sigils*0.70;

    if(u_is_foil) {
        // Bronze dragon bones become embossed metal; broad violet/gold
        // interference remains apparent on a static listing thumbnail.
        float phase=p.x*2.1-p.y*3.4+0.08*sin(p.y*28.0)+t*0.115+seed*0.2;
        vec3 spectrum=0.5+0.5*cos(6.283185*(phase+vec3(0.0,0.333,0.667)));
        vec3 interference=mix(2.0*col*spectrum,1.0-2.0*(1.0-col)*(1.0-spectrum),step(vec3(0.5),col));
        col=mix(col,interference,(0.36+0.19*bone)*(1.0-face*0.92));
        float shine=pow(0.5+0.5*sin(p.x*16.0+p.y*21.0-t*1.3),8.0);
        col+=(1.0-col)*mix(vec3(1.0,0.80,0.42),spectrum,0.48)
            *(0.13+0.43*shine)*(0.33+bone*0.92)*(1.0-face);
        col+=(1.0-col)*vec3(0.64,0.81,1.0)*(web+sigils)*0.25;
    }
    gl_FragColor=vec4(mix(source.rgb,clamp(col,0.0,1.0),art),source.a);
}
